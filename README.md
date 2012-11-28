proteus-cluster
==============================

Clusterは、Node.jsのclusterモジュールの利便性を高めたモジュールです。以下の特徴を持ちます。

- worker異常終了時の自動再起動
- workerのgraceful restart / shudown
- proteus-loggerと連携したmasterプロセスのログ一元管理
- workerからmasterへのメッセージ受け渡し機構

# Usage

## settings（[]はデフォルト値）

- worker
 - 起動するworker数 [サーバのCPU数]
- pid
 - プロセスID  [/tmp/proteus-cluster.pid]
- exec
 - workerとして起動したい処理を含むJSファイル [clusterの起動元のファイル]
- disconnectTimeout
 - workerを落とす際のタイムアウト時間 [120000]
- maxForkCount
 - workerをforkする回数の上限値(永久に再起動を繰り返さないための対応) [100]

## use cluster process

masterを起動 (cluster.js)

```js
var cluster = require('proteus').cluster;
var conf = {};
conf.worker = 4;
conf.pid = '/tmp/proteus.pid';
conf.exec = 'worker.js';
conf.disconnectTimeout = 5000;
cluster(conf);
```

workerの実装 (worker.js)

```js
// 通常通りの実装を行う
var express = require('express');
var app = express();
var port = 8080;
app.configure(function() {
	app.get('/', function(req, res) {
		res.send('running worker '+process.pid);
	});
});
app.listen(port);
```

## use graceful restart

シェルから実行

```shell
$ node cluster.js
$ ps ax | grep node
4377 s000  S+     0:00.17 node cluster.js
$ kill -SIGUSR2 4377
```

API実行

```js
cluster.restart();
```

## use graceful shutdown

シェルから実行

```shell
$ node cluster.js
$ ps ax | grep node
4377 s000  S+     0:00.17 node cluster.js
$ kill -SIGINT 4377
```

API実行

```js
cluster.shutdown();
```

## use message listener

masterの実装 (cluster.js)

```js
cluster.addMessageListener('fromWorker', function(msg) {
	logger.info(msg.msg);
});
```

workerの実装 (worker.js)

```js
process.send({cmd: 'fromWorker', msg: 'sending message to master'});
```

# License

Copyright 2012 CyberAgent, Inc.

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

[http://www.apache.org/licenses/LICENSE-2.0](http://www.apache.org/licenses/LICENSE-2.0)

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
