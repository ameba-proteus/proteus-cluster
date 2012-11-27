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

// const
var WORKER_MESSAGE_LOG = 'LOG';
var CLUSTER_MODE_RUNNING    = 0x01;
var CLUSTER_MODE_RESTARTING = 0x02;
var CLUSTER_MODE_SHUTTING   = 0x03;
var DEFAULT_DISCONNECT_TIMEOUT = 30000;

// variables
var _expiredQueue = [];
var _clusterStatus;
var _disconnectTimeout;
var _disconnectTimer;

/**
 * creating cluster
 * @param {String} conf
 */
function createCluster(conf) {
	// only for master process
	if (!cluster.isMaster) {
		throw new Error('cluster module must be executed from master process.');
	}

	// start master
	logger.info('starting master ' + process.pid);

	// manage expired workers
	_clusterStatus = CLUSTER_MODE_RUNNING;
	_disconnectTimeout = conf.disconnectTimeout || DEFAULT_DISCONNECT_TIMEOUT;
	_disconnectTimer;

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
	var pidfile = conf.pid || '/tmp/proteus.pid';
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
		var expiredWorker = _expiredQueue.shift();

		// set disconnect timer
		_disconnectTimer = setTimeout(function() {
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
		if (_disconnectTimer) {
			clearTimeout(_disconnectTimer);
			_disconnectTimer = null;
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
		// LOG
		if (msg && msg.cmd === WORKER_MESSAGE_LOG) {
			logger[msg.level](msg.msg, msg.meta);
		}
	});
}

/**
 * restart all workers
 */
function restart() {
	// if already in CLUSTER_MODE_RESTARTING mode, or going to shut down
	if (_clusterStatus === CLUSTER_MODE_RESTARTING || _clusterStatus === CLUSTER_MODE_SHUTTING) {
		return;
	}
	logger.info('restarting workers');
	_clusterStatus = CLUSTER_MODE_RESTARTING;

	// add all running workers into expired queue
	for (var id in cluster.workers) {
		_expiredQueue.push(cluster.workers[id]);
	}
	// disconnect expired worker
	disconnectExpiredWorker();
}

/**
 * shutdown cluster gracefully
 */
function shutdown() {
	logger.info('shutdown cluster gracefully');

	// if already in CLUSTER_MODE_SHUTTING mode
	if (_clusterStatus === CLUSTER_MODE_SHUTTING) {
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

	// if already in CLUSTER_MODE_SHUTTING mode
	if (_clusterStatus === CLUSTER_MODE_SHUTTING) {
		return;
	}
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

