/**
 * @fileOverview Cluster Module
 * @module proteus-cluster
 */

// node modules
var fs = require('fs')
  , os = require('os')
  , cluster = require('cluster')
  , proteusLogger = require('proteus-logger')
  , logger = proteusLogger.get('proteus')
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
var   WORKER_MESSAGE_LOG = '__LOG__'
	, CLUSTER_MODE_RUNNING    = 0x01
	, CLUSTER_MODE_RESTARTING = 0x02
	, CLUSTER_MODE_SHUTTING   = 0x03
	, DEFAULT_DISCONNECT_TIMEOUT = 120000
	, DEFAULT_MAX_FORK_COUNT = 100
	;

// variables
var   _expiredQueue
	, _clusterStatus = CLUSTER_MODE_SHUTTING
	, _disconnectTimeout
	, _disconnectTimer
	, _messageListeners = {}
	, _maxForkCount = DEFAULT_MAX_FORK_COUNT
	, _forkedCount
	, _pidfile
	;

/**
 * creating cluster
 * @param {Object} conf
 */
function createCluster(conf) {
	// only for master process
	if (!cluster.isMaster) {
		throw new Error('cluster module must be executed from master process.');
	}

	// if not in CLUSTER_MODE_SHUTTING mode
	if (_clusterStatus !== CLUSTER_MODE_SHUTTING) {
		return;
	}

	logger.info('starting master ' + process.pid);

	// register message listener for logger
	addMessageListener(WORKER_MESSAGE_LOG, function(msg) {
		var targetLogger = proteusLogger.get(msg.logger);
		targetLogger[msg.level](msg.msg, msg.meta);
	});

	// manage expired workers
	_clusterStatus = CLUSTER_MODE_RUNNING;
	_disconnectTimeout = conf.disconnectTimeout || DEFAULT_DISCONNECT_TIMEOUT;
	_expiredQueue = [];
	_disconnectTimer = {};
	_maxForkCount = conf.maxForkCount || DEFAULT_MAX_FORK_COUNT;
	_forkedCount = 0;

	// set worker settings
	cluster.setupMaster({
		exec : conf.exec,
		args : conf.args
	});

	// start all workers
	var workerNum = conf.worker || os.cpus().length;
	for (var i = 0; i < workerNum; i++) {
		fork();
	}

	// create pid file
	_pidfile = conf.pid || '/tmp/proteus-cluster.pid';
	fs.writeFileSync(_pidfile, String(process.pid), 'utf8');

	// initialize API listener
	if ('api' in conf) {

		var listen = conf.api.listen;
		var port = conf.api.port || 8111;

		var http = require('http');

		// create server
		var server = http.createServer(function(req, res) {
			logger.info('HTTP command received', {method:req.method, url:req.url});
			if (req.method === 'POST' && req.url === '/send') {
				var body = '';
				req.setEncoding('utf8');
				req
				.on('data', function(data) {
					body += data;
				})
				.on('end', function() {
					var message = JSON.parse(body);
					sendMessage(message);
					res.statusCode = 200;
					res.end('OK');
				});
			// restart workers
			} else if (req.method === 'GET' && req.url === '/restart') {
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
				logger.info('Cluster HTTP-API is listening on 0.0.0.0:' + listen);
			});
		}
	}
	// attache signals
	process.on('SIGUSR2', restart);				// restart workers
	process.on('SIGHUP', function() {});		// ignore SIGHUP for background processing
	process.on('SIGINT', shutdown);				// exit with signal 0
	process.on('SIGTERM', shutdown);			// exit with signal 0

	// TODO can't capture SIGKILL event
//	process.on('SIGKILL', forceShutdown);		// exit with signal 1
}

/**
 * disconnect single expired worker dequeued from expiredQueue
 */
function disconnectExpiredWorker() {
	if (_expiredQueue.length > 0) {
		var expiredWorkerId = _expiredQueue.shift();
		var expiredWorker = cluster.workers[expiredWorkerId];

		// set disconnect timer
		_disconnectTimer[expiredWorkerId] = setTimeout(function() {
			logger.info('disconnect timeout. destroying worker ' + expiredWorker.process.pid);
			expiredWorker.destroy();
		}, _disconnectTimeout);

		logger.info('going to disconnect worker ' + expiredWorker.process.pid);
		// mark restart
		expiredWorker.restart = true;
		expiredWorker.disconnect();
	} else {
		// set to CLUSTER_MODE_RUNNING mode if all expired workers has been disconnected
		_clusterStatus = CLUSTER_MODE_RUNNING;
	}
}

/**
 * fork new worker
 */
function fork() {

	// start worker from this file
	var worker = cluster.fork();
	logger.info('add worker', { pid:worker.process.pid, id:worker.id });
	_forkedCount++;

	// when worker disconnected
	worker.on('disconnect', function() {
		logger.info('worker disconnect', { pid: worker.process.pid });

		// clear disconnect timer if exists
		if (_disconnectTimer[worker.id]) {
			clearTimeout(_disconnectTimer[worker.id]);
			delete _disconnectTimer[worker.id];
		}

		// fork new worker if server is still in CLUSTER_MODE_RUNNING or CLUSTER_MODE_RESTARTING mode
		if (_clusterStatus === CLUSTER_MODE_RUNNING || _clusterStatus === CLUSTER_MODE_RESTARTING) {
			// fork is called too many times. shtudown cluster.
			if (_forkedCount > _maxForkCount) {
				logger.info('too many forked workers. going to shutdown.');
				shutdown();
			} else if (worker.suicide === true && !worker.restart) {
				logger.info('worker suicided', {id:worker.id});
			} else {
				fork();
			}
		}
	});

	// when worker becomes active
	worker.on('online', function() {
		logger.info('worker becomes active ' + worker.process.pid);
		// disconnect expired worker
		disconnectExpiredWorker();
	});

	// when worker sends message
	worker.on('message', function(msg) {
		if (msg && msg.hasOwnProperty('cmd')) {
			// if message listener is registered
			if (_messageListeners[msg.cmd]) {
				_messageListeners[msg.cmd](msg);
			}
		}
	});
}

/**
 * restart all workers
 */
function restart() {
	// if not in CLUSTER_MODE_RUNNING mode
	if (_clusterStatus !== CLUSTER_MODE_RUNNING) {
		return;
	}
	_clusterStatus = CLUSTER_MODE_RESTARTING;

	logger.info('restarting workers');

	// add all running workers into expired queue
	for (var id in cluster.workers) {
		_expiredQueue.push(id);
	}
	// disconnect expired worker
	disconnectExpiredWorker();
}

/**
 * shutdown cluster gracefully
 */
function shutdown() {
	// if not in CLUSTER_MODE_RUNNING mode
	if (_clusterStatus !== CLUSTER_MODE_RUNNING && _clusterStatus !== CLUSTER_MODE_RESTARTING) {
		return;
	}
	_clusterStatus = CLUSTER_MODE_SHUTTING;

	logger.info('shutdown cluster gracefully');

	cluster.disconnect(function(){
		logger.info('all workers has been disconnected');
		try {
			fs.unlinkSync(_pidfile);
		} catch (e) {
		}
		logger.info('process exit with code 0');
		process.exit(0);
	});
}

/**
 * shutdown cluster forcefully
 */
function forceShutdown() {
	_clusterStatus = CLUSTER_MODE_SHUTTING;

	logger.info('shutdown cluster forcefully');

	for (var id in cluster.workers) {
		cluster.workers[id].process.kill('SIGKILL');
	}
	try {
		fs.unlinkSync(_pidfile);
	} catch (e) {
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


