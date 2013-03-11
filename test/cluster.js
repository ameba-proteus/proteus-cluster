var cluster = require('..');
var http = require('http');

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

var conf = {};
conf.worker = 2;
conf.pid = '/tmp/proteus-cluster.pid';
conf.exec = __dirname + '/worker.js';
conf.disconnectTimeout = 120000;
conf.maxForkCount = 100;
conf.args = ['--test'];
conf.api = {
	listen: '0.0.0.0',
	port: 8881
};

var cnt = 0;
cluster.addMessageListener('fromWorker', function() {
	//	logger.debug('[master] message received : ' + JSON.stringify(obj.msg));
	cnt++;
	if (cnt >= 4) {
		cluster.shutdown();
	}
});

cluster(conf);

//	logger.debug('[master] going to send message from master');
cluster.sendMessage({msg: 'message from master'});

process.nextTick(function(){
//	logger.debug('[master] going to send message from master using HTTP API');
	var data = JSON.stringify({'msg': 'message from master using HTTP API'});
	var post = http.request({
		host: 'localhost',
		port: 8881,
		path: '/send',
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			'Content-Length': data.length
		}
	}, function(res) {
		console.log("RESPONSE CLUSTER",res.statusCode);
	});
	post.write(data);
	post.end();
});


