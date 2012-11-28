function sendMessage() {
	var sTime = new Date().getTime();
	while(true) {
		var eTime = new Date().getTime();
		if (eTime - sTime > 10) {
			try {
				process.send({cmd: 'fromWorker', msg: 'message from worker ' + process.pid});
			} catch(e){}
			break;
		}
	}
	process.nextTick(sendMessage);
}
sendMessage();
