'use strict';
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

//logger.debug(process.argv);

function sendPong() {
  try {
    logger.debug('[worker] going to send message from worker');

    process.send({cmd: 'pong', msg: 'message from worker ' + process.pid});
    process.exit(0);
  } catch(e){
    process.exit(0);
  }
}

process.on('message', function(obj) {
  logger.debug('[worker] message received : ' + JSON.stringify(obj));
  if (obj.cmd === 'ping') {
    sendPong();
  }
});
