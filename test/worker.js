//var proteusLogger = require('proteus-logger');
//proteusLogger.configure({
//	'cluster-test': {
//		console: {
//			colorize: 'true',
//			timestamp: 'true'
//		}
//	}
//});
//var logger = proteusLogger.get('cluster-test');

//logger.debug(process.argv);

function sendMessage() {
	try {
		// logs will be sent to the master process
//		logger.debug('[worker] going to send message from worker');

		process.send({cmd: 'fromWorker', msg: 'message from worker ' + process.pid});
		process.exit(0);
	} catch(e){
		process.exit(0);
	}
}

process.on('message', function(msg) {
//	logger.debug('[worker] message received : ' + JSON.stringify(msg));
	sendMessage();
});
