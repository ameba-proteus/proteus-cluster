var cluster = require('..');

var conf = {};
conf.worker = 2;
conf.pid = '/tmp/proteus-cluster.pid';
conf.exec = __dirname + '/worker.js';
conf.disconnectTimeout = 120000;
conf.maxForkCount = 100;

var cnt = 0;
cluster.addMessageListener('fromWorker', function(msg) {
	cnt++;
	if (cnt > 10) {
		cluster.shutdown();
	}
});

cluster(conf);

