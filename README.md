proteus-cluster
==============================

Clusterは、Node.jsのclusterモジュールの利便性を高めたモジュールです。以下の特徴を持ちます。

- worker異常終了時の自動再起動
- workerのgraceful restart / shudown
- loggerと連携したmasterプロセスのログ一元管理

# Usage

## settings（[]はデフォルト値）

- worker
- 起動するworker数 [サーバのCPU数]
- pid
- プロセスID  [/tmp/proteus.pid]
- exec - workerとして起動したい処理を含むJSファイル [clusterの起動元のファイル]
- disconnectTimeout
- workerを落とす際のタイムアウト時間 [30000]

## use cluster process

clusterを起動 (cluster.js)

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
// 通常の実装
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

#### use graceful restart

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

#### use graceful shutdown

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
