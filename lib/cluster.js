/**
 * @fileOverview Cluster Module
 * @module proteus-cluster
 */

// node modules
var fs = require('fs')
  , os = require('os')
  , cluster = require('cluster')
  , loggers = require('proteus-logger')
  , logger = loggers.get('cluster')
  ;

// exports
exports = module.exports = createCluster;
exports.restart = restart;
exports.shutdown = shutdown;
exports.forceShutdown = forceShutdown;
exports.addMessageListener = addMessageListener;
exports.removeMessageListener = removeMessageListener;
exports.sendMessage = sendMessage;

// const
var DEFAULT_DISCONNECT_TIMEOUT = 10000
  , DEFAULT_MAX_FORK_COUNT = 100
  ;

// variables
var _pidfile
  , _messageListeners = {}
  , _expiredQueue = []
  , _disconnectTimeout
  , _disconnectTimer = {}
  , _maxForkCount = DEFAULT_MAX_FORK_COUNT
  , _forkedCount = 0
  , _isShutting = false
  , _isRestarting = false
  ;

/**
 * creating cluster
 * @param {Object} conf
 */
function createCluster(conf) {

  // set worker settings
  var setup = {
    exec : conf.exec,
    args : conf.args
  };
  logger.info('setup master', JSON.stringify(setup));

  cluster.setupMaster(setup);

  logger.debug('starting master ' + process.pid);

  // setup event will be called only once
  _disconnectTimeout = conf.disconnectTimeout || DEFAULT_DISCONNECT_TIMEOUT;
  _maxForkCount = conf.maxForkCount || DEFAULT_MAX_FORK_COUNT;

  logger.info('disconnect timeout : ' + _disconnectTimeout);
  logger.info('max fork count : ' + _maxForkCount);

  // start all workers
  var workerNum = conf.worker || os.cpus().length;
  for (var i = 0; i < workerNum; i++) {
    fork();
  }

  // create pid file
  if (conf.pid) {
    _pidfile = conf.pid;
    logger.info('create pid file : ' + _pidfile);

    fs.writeFileSync(_pidfile, String(process.pid), 'utf8');
  }

  // initialize API listener
  if ('api' in conf) {
    setupAPI(conf.api);
  }

  // when worker has been exited
  cluster.on('exit', function(worker, code, signal) {

    logger.debug('worker exited', { pid: worker.process.pid, id: worker.id });

    // clear disconnect timer if exists
    if (_disconnectTimer[worker.id]) {
      clearTimeout(_disconnectTimer[worker.id]);
      delete _disconnectTimer[worker.id];
    }

    // if worker was set as restart, or killed accidentally fork/shutdown
    if (worker.restart || !worker.suicide) {

      // if worker was forked less than max count, fork again
      if (_forkedCount < _maxForkCount) {
        return fork();
      }
      logger.info('too many forked workers. going to shutdown.');
      return shutdown();
    }

    // if worker was killed and not set as restart, do nothing
  });

  // attache signals
  process.on('SIGUSR2', restart);        // restart workers
  process.on('SIGHUP', function() {});    // ignore SIGHUP for background processing
  process.on('SIGINT', shutdown);        // exit with signal 0
  process.on('SIGTERM', shutdown);      // exit with signal 0

}

function setupAPI(api) {
  var listen = api.listen;
  var port = api.port || 8111;
  var workerTimeout = api.workerTimeout || 5000;

  var http = require('http');

  // create server
  var server = http.createServer(function(req, res) {
    logger.debug('HTTP command received', {method:req.method, url:req.url});
    var body = '';
    var message;
    if (req.method === 'POST' && req.url === '/send') {
      req.setEncoding('utf8');
      req
        .on('data', function(data) {
          body += data;
        })
        .on('end', function() {
          try {
            message = JSON.parse(body);
          } catch (e) {
            res.statusCode = 400;
            return res.end('request body parse failure.');
          }
          sendMessage(message);
          res.statusCode = 200;
          res.end('OK');
        });
    } else if (req.method === 'POST' && req.url === '/sync_send') {
      req.setEncoding('utf8');
      req
        .on('data', function(data) {
          body += data;
        })
        .on('end', function() {
          try {
            message = JSON.parse(body);
          } catch (e) {
            res.statusCode = 400;
            return res.end('request body parse failure.');
          }

          var workerIds = Object.keys(cluster.workers);
          var workerResults = [];

          var cmd = message && message.cmd;
          if (!cmd) {
            sendMessage(message);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            for (var i = 0; i < workerIds.length; i++) {
              workerResults.push('OK');
            }
            return res.end(JSON.stringify(workerResults));
          }

          if (typeof _messageListeners[cmd] === 'function') {
            res.statusCode = 500;
            return res.end('server too busy.');
          }

          addMessageListener(cmd, function(msg, worker) {
            workerIds = workerIds.filter(function(v) {
              return v !== '' + worker.id;
            });

            workerResults.push(msg && msg.msg || '');

            if (workerIds.length <= 0) {
              clearTimeout(timer);
              removeMessageListener(cmd);
              res.writeHead(200, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify(workerResults));
            }
          });

          sendMessage(message);

          var timer = setTimeout(function() {
            removeMessageListener(cmd);
            res.statusCode = 500;
            res.end('worker timeout.');
          }, message.timeout || workerTimeout);
        });
    } else if (req.method === 'GET' && req.url === '/restart') {
      // restart workers
      restart();
      res.statusCode = 200;
      res.end('OK');
    } else {
      res.statusCode = 404;
      res.end('NOT FOUND');
    }
  });
  if (listen) {
    server.listen(port, listen, function() {
      logger.info('Cluster HTTP-API is listening on ' + listen + ':' + port);
    });
  } else {
    server.listen(port, function() {
      logger.info('Cluster HTTP-API is listening on 0.0.0.0:' + port);
    });
  }
}

/**
 * fork new worker
 */
function fork() {

  // start worker
  var worker = cluster.fork();
  _forkedCount++;

  logger.debug('fork new worker', { pid:worker.process.pid, id:worker.id });

  // when worker has been disconnected
  worker.on('disconnect', function() {
    logger.debug('worker disconnected', { pid: worker.process.pid, id: worker.id });
  });

  // when worker becomes active
  worker.on('online', function() {
    logger.info('worker becomes active', { pid: worker.process.pid, id: worker.id });
    // disconnect expired worker
    disconnectExpiredWorker();
  });

  // when worker sends message
  worker.on('message', function(msg) {
    if (msg && 'cmd' in msg) {
      // if message listener is registered
      if (_messageListeners[msg.cmd]) {
        _messageListeners[msg.cmd](msg, worker);
      }
    }
  });
}

/**
 * shutdown cluster gracefully
 */
function shutdown() {

  if (_isShutting) return;
  _isShutting = true;

  logger.info('shutdown cluster gracefully');

  // disconnect all workers
  for (var id in cluster.workers) {
    var worker = cluster.workers[id];

    logger.debug('going to disconnect worker', { pid: worker.process.pid, id: worker.id });

    // mark don't restart
    worker.restart = false;

    // set disconnect timer
    _disconnectTimer[id] = setTimeout(forceDisconnect(worker), _disconnectTimeout);
  }

  // if all worker has been disconnected
  cluster.disconnect(function(){
    logger.debug('all workers has been disconnected');
    if (_pidfile) {
      try {
        fs.unlinkSync(_pidfile);
      } catch (e) {
      }
    }
    // in case worker processes are still alive
    process.nextTick(function(){
      logger.debug('process exit with code 0');
      process.exit(0);
    });
  });
}

/**
 * restart all workers
 */
function restart() {

  if (_isRestarting || _isShutting) return;
  _isRestarting = true;

  logger.info('restarting workers');

  // add all running workers into expired queue
  for (var id in cluster.workers) {
    _expiredQueue.push(id);
  }
  // disconnect expired worker
  disconnectExpiredWorker();
}

function forceDisconnect(worker) {
  return function() {
    logger.debug('disconnect timeout. destroying worker', { pid: worker.process.pid, id: worker.id });
    if (worker.kill) {
      worker.kill('SIGKILL');
    } else {
      worker.destroy('SIGKILL');
    }
  };
}

/**
 * disconnect single expired worker dequeued from expiredQueue
 */
function disconnectExpiredWorker() {
  if (_expiredQueue.length > 0) {
    var expiredWorkerId = _expiredQueue.shift();
    var expiredWorker = cluster.workers[expiredWorkerId];
    if (!expiredWorker) {
      // check if expired worker still exists
      return disconnectExpiredWorker();
    }

    logger.debug('going to disconnect worker', { pid: expiredWorker.process.pid, id: expiredWorker.id });

    // set disconnect timer
    _disconnectTimer[expiredWorkerId] = setTimeout(forceDisconnect(expiredWorker), _disconnectTimeout);

    // mark restart
    expiredWorker.restart = true;
    expiredWorker.disconnect();
  } else {
    _isRestarting = false;
  }
}

/**
 * shutdown cluster forcefully
 */
function forceShutdown() {

  logger.info('shutdown cluster forcefully');

  for (var id in cluster.workers) {
    cluster.workers[id].process.kill('SIGKILL');
  }
  if (_pidfile) {
    try {
      fs.unlinkSync(_pidfile);
    } catch (e) {
    }
  }
  process.exit(1);
}

/**
 * add message listener
 * message listener is used to send message from worker to master process.
 * @param {String} cmd
 * @param {Function} fn
 */
function addMessageListener(cmd, fn) {
  _messageListeners[cmd] = fn;
}

/**
 * remove message listener
 * @param {String} cmd
 */
function removeMessageListener(cmd) {
  delete _messageListeners[cmd];
}

/**
 * send message to workers
 * @param {Object} obj
 */
function sendMessage(obj) {
  if (cluster.isMaster) {
    for (var id in cluster.workers) {
      cluster.workers[id].send(obj);
    }
  }
}
