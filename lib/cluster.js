/**
 * @fileOverview Cluster Module
 * @module proteus-express
 */

// node modules
var fs = require('fs')
  , os = require('os')
  , cluster = require('cluster')
  , logger = require('proteus-logger').logger()
  ;

// exports
exports = module.exports = createCluster;
exports.restart = restart;
exports.shutdown = shutdown;
exports.forceShutdown = forceShutdown;
exports.addMessageListener = addMessageListener;
exports.removeMessageListener = removeMessageListener;

// const
var WORKER_MESSAGE_LOG = 'LOG';
var CLUSTER_MODE_RUNNING    = 0x01;
var CLUSTER_MODE_RESTARTING = 0x02;
var CLUSTER_MODE_SHUTTING   = 0x03;
var DEFAULT_DISCONNECT_TIMEOUT = 30000;

// variables
var _expiredQueue;
var _clusterStatus = CLUSTER_MODE_SHUTTING;
var _disconnectTimeout;
var _disconnectTimer;
var messageListeners = {};

/**
 * creating cluster
 * @param {String} conf
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
		logger[msg.level](msg.msg, msg.meta);
	});

	// manage expired workers
	_clusterStatus = CLUSTER_MODE_RUNNING;
	_disconnectTimeout = conf.disconnectTimeout || DEFAULT_DISCONNECT_TIMEOUT;
	_expiredQueue = [];
	_disconnectTimer = {};

	// set exec file
	if (conf.exec) {
		cluster.setupMaster({
			exec : conf.exec
		});
	}
	
	// start all workers
	var workerNum = conf.worker || os.cpus().length;
	for (var i = 0; i< workerNum; i++) {
		fork();
	}

	// create pid file
	var pidfile = conf.pid || '/tmp/proteus-cluster.pid';
	fs.writeFileSync(pidfile, String(process.pid), 'utf8');

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
	logger.info('add worker ' + worker.process.pid);

	// when worker disconnected
	worker.on('disconnect', function() {
		logger.info('worker disconnected ' + worker.process.pid);

		// clear disconnect timer if exists
		if (_disconnectTimer[worker.id]) {
			clearTimeout(_disconnectTimer[worker.id]);
			delete _disconnectTimer[worker.id];
		}

		// fork new worker if server is still in CLUSTER_MODE_RUNNING or CLUSTER_MODE_RESTARTING mode
		if (_clusterStatus === CLUSTER_MODE_RUNNING || _clusterStatus === CLUSTER_MODE_RESTARTING) {
			fork();
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
			if (messageListeners[msg.cmd]) {
				messageListeners[msg.cmd](msg);
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
	logger.info('restarting workers');
	_clusterStatus = CLUSTER_MODE_RESTARTING;

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
	logger.info('shutdown cluster gracefully');

	// if not in CLUSTER_MODE_RUNNING mode
	if (_clusterStatus !== CLUSTER_MODE_RUNNING) {
		return;
	}
	_clusterStatus = CLUSTER_MODE_SHUTTING;

	cluster.disconnect(function(){
		logger.info('all workers has been disconnected');
		try {
			fs.unlinkSync(pidfile);
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
	logger.info('shutdown cluster forcefully');

	_clusterStatus = CLUSTER_MODE_SHUTTING;

	for (var id in cluster.workers) {
		cluster.workers[id].process.kill('SIGKILL');
	}
	try {
		fs.unlinkSync(pidfile);
	} catch (e) {
	}
	process.exit(1);
}

/**
 * add message listener
 * message listener is used to send message from worker to master process.
 */
function addMessageListener(cmd, func) {
	messageListeners[cmd] = func;
}

/**
 * remove message listener
 */
function removeMessageListener(cmd) {
	delete messageListeners[cmd];
}

