//var proteusLogger = require('proteus-logger');
//proteusLogger.configure({
//        'cluster-test': {
//                console: {
//                        colorize: 'true',
//                        timestamp: 'true'
//                }
//        }
//});
//var logger = proteusLogger.get('cluster-test');

function sendMessage() {
	var sTime = new Date().getTime();
	while(true) {
		var eTime = new Date().getTime();
		if (eTime - sTime > 10) {
			try {
				// logs will be sent to the master process
//				logger.debug('message sent from worker');

				process.send({cmd: 'fromWorker', msg: 'message from worker ' + process.pid});
			} catch(e){
				process.exit(0);
			}
			break;
		}
	}
	process.nextTick(sendMessage);
}
sendMessage();
