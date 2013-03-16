var loggers = require('proteus-logger');
loggers.configure({
	appenders: {
		console: {
			type: 'console'
		},
		file: {
			type: 'rotate_file',
			layout: {
				pattern: "%yyyy-%MM-%dd%T%HH:%mm:%ss %level %logger %msg %args (%line)%nstack%n"
			}
		}
	},
	loggers: {
		"default": {
			appenders: ["file","console"],
			level: "debug"
		}
	}
});
var logger = loggers.get('cluster-test');

logger.debug(process.argv);

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
