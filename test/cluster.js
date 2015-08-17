'use strict';
/* global describe,it,before,beforeEach */
var cluster = require('..');
var expect = require('expect.js');
var http = require('http');

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
logger.info("TEST");

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

describe('cluster', function() {
  describe('sendMessage', function() {
    var cnt;

    before(function() {
      cluster(conf);
    });

    beforeEach(function() {
      cnt = 0;
    });

    cluster.addMessageListener('pong', function(obj) {
      logger.debug('[master] message received : ' + JSON.stringify(obj));
      expect(obj.cmd).to.eql('pong');
      cnt++;
    });

    it('send message from master', function(done) {
      cluster.sendMessage({cmd: 'ping', msg: 'message from master'});

      setTimeout(function() {
        expect(cnt).to.eql(conf.worker);
        done();
      }, 2000);
    });

    it('send message from master using HTTP API', function(done) {
      logger.debug('[master] going to send message from master using HTTP API');
      var data = JSON.stringify({cmd: 'ping',msg: 'message from master using HTTP API'});
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
        logger.debug("RESPONSE CLUSTER",res.statusCode);
      });
      post.write(data);
      post.end();

      setTimeout(function() {
        expect(cnt).to.eql(conf.worker);
        done();
      }, 2000);
    });
  });
});
