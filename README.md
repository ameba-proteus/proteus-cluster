proteus-cluster
==============================

# Languages

* [English](#english)
* [日本語](#日本語)



# English


## About

Proteus Cluster is a module to use Node.js cluster module more conveniently.

This module collaborate with [Proteus Logger](https://github.com/ameba-proteus/proteus-logger) to support logging under the clustered environment. See [Proteus Logger](https://github.com/ameba-proteus/proteus-logger) for more detail.

The following are the features.

- Worker will be automatically restarted when the process aborted.
- Graceful restart/shutdown for workers.
- Collaborate with [Proteus Logger](https://github.com/ameba-proteus/proteus-logger) to unify the log management by master.
- Message sending mechanism between mater and workers.


# Usage


## settings（[] are the default value）

- worker
 - number of workers to run [number of CPUs]
- pid
 - process id file [/tmp/proteus-cluster.pid]
- exec
 - startup JS file for workers [__filename]
- disconnectTimeout
 - timeout milliseconds for worker to wait for graceful shutdown [120000]
- maxForkCount
 - max fork count for worker (in case of endless restart) [100]
- args
 - arguments for worker (array)


## start cluster

master implementation (cluster.js)

```js
var cluster = require('proteus').cluster;
var conf = {};
conf.worker = 4;
conf.pid = '/tmp/proteus.pid';
conf.exec = 'worker.js';
conf.disconnectTimeout = 5000;
cluster(conf);
```

worker implementation (worker.js)

```js
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


## graceful restart

run from shell

```shell
$ node cluster.js
$ ps ax | grep node | grep -v 'grep'
 2051 s000  S+     0:00.09 node cluster.js
 2052 s000  R+     0:00.42 node /proteus-cluster/test/worker.js
 2053 s000  R+     0:00.42 node /proteus-cluster/test/worker.js
$ kill -SIGUSR2 2051
```

run by API

```js
cluster.restart();
```


## graceful shutdown

run from shell

```shell
$ node cluster.js
$ ps ax | grep node | grep -v 'grep'
 2051 s000  S+     0:00.09 node cluster.js
 2052 s000  R+     0:00.42 node /proteus-cluster/test/worker.js
 2053 s000  R+     0:00.42 node /proteus-cluster/test/worker.js
$ kill -SIGINT 2051
```

run from API

```js
cluster.shutdown();
```


## send messages from worker to master

worker implementation (worker.js)

```js
process.send({cmd: 'fromWorker', msg: 'sending message to master'});
```

master implementation (cluster.js)

```js
cluster.addMessageListener('fromWorker', function(msg) {
	logger.debug(msg.msg); // sending message to master
});

// you can remove messageListener
cluster.removeMessageListener('fromWorker');
```


## send messages from master to workers

master implementation (cluster.js)

```js
cluster.sendMessage({cmd: 'fromMaster', msg: 'sending message to worker'});
```

worker implementation (worker.js)

```js
process.on('message', function(msg) {
	logger.debug(msg.msg); // sending message to worker
});
```


# 日本語


## 説明

Proteus Clusterは、Node.jsのclusterモジュールの利便性を高めたモジュールです。

[Proteus Logger](https://github.com/ameba-proteus/proteus-logger) と連携し、node.js の cluster 環境におけるログ出力をサポートします。詳細は [Proteus Logger](https://github.com/ameba-proteus/proteus-logger) をご参照下さい。

以下の特徴を持ちます。

- worker異常終了時の自動再起動
- workerのgraceful restart/shudown
- proteus-loggerと連携したmasterプロセスのログ一元管理
- masterとworker間のメッセージ受け渡し機構


# 利用方法


## settings（[]はデフォルト値）

- worker
 - 起動するworker数 [サーバのCPU数]
- pid
 - プロセスID  [/tmp/proteus-cluster.pid]
- exec
 - workerの起動JSファイル [__filename]
- disconnectTimeout
 - workerを安全に停止するためのタイムアウト時間。時間を過ぎると強制停止される。 [120000]
- maxForkCount
 - workerをforkする回数の上限値（永久に再起動を繰り返さないための対応） [100]
- args
 - workerに渡す引数（配列）


## cluster起動

masterの実装 (cluster.js)

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


## graceful restart

シェルから実行

```shell
$ node cluster.js
$ ps ax | grep node | grep -v 'grep'
 2051 s000  S+     0:00.09 node cluster.js
 2052 s000  R+     0:00.42 node /proteus-cluster/test/worker.js
 2053 s000  R+     0:00.42 node /proteus-cluster/test/worker.js
$ kill -SIGUSR2 2051
```

API実行

```js
cluster.restart();
```


## graceful shutdown

シェルから実行

```shell
$ node cluster.js
$ ps ax | grep node | grep -v 'grep'
 2051 s000  S+     0:00.09 node cluster.js
 2052 s000  R+     0:00.42 node /proteus-cluster/test/worker.js
 2053 s000  R+     0:00.42 node /proteus-cluster/test/worker.js
$ kill -SIGINT 2051
```

API実行

```js
cluster.shutdown();
```


## workerからmasterへのメッセージ送信

workerの実装 (worker.js)

```js
process.send({cmd: 'fromWorker', msg: 'sending message to master'});
```

masterの実装 (cluster.js)

```js
cluster.addMessageListener('fromWorker', function(msg) {
	logger.info(msg.msg); // sending message to master
});

// messageListenerの削除も可能
cluster.removeMessageListener('fromWorker');
```


## masterからworkerへのメッセージ送信

master implementation (cluster.js)

```js
cluster.sendMessage({cmd: 'fromMaster', msg: 'sending message to worker'});
```

worker implementation (worker.js)

```js
process.on('message', function(msg) {
	logger.debug(msg.msg); // sending message to worker
});
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

