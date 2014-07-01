var Lab = require('lab');
var describe = Lab.experiment;
var it = Lab.test;
var expect = Lab.expect;
var beforeEach = Lab.beforeEach;
var before = Lab.before;
var after = Lab.after;

var createCount = require('callback-count');
var redis = require('redis');
var configs = require('configs');
var uuid = require('uuid');
var buildStream = require('../lib/socket/build-stream.js');

var Primus = require('primus');
var http = require('http');
var httpServer;
var primusClient = Primus.createSocket({
  transformer: configs.primus.transformer,
  plugin: {
    'substream': require('substream')
  },
  parser: 'JSON'
});

describe('build-stream', function () {
  var primusServer;

  before(function (done) {
    httpServer = http.createServer();
    primusServer = new Primus(
      httpServer,
      {
        transformer: configs.socketType,
        parser: 'JSON'
      });
    buildStream.attachBuildStreamHandelerToPrimus(primusServer);
    httpServer.listen(configs.port);
    done();
  });

  after(function (done) {
    httpServer.close();
    done();
  });

  it('should send data to all clients', function (done) {
    var roomId = uuid();;
    var testString = "this is yet another message";
    var numClients = 10;
    var createCount = require('callback-count');
    var clientOpenCount = createCount(numClients, sendData);
    var clientReadCount = createCount(numClients, done);

    for (var i = numClients - 1; i >= 0; i--) {
      var client = new primusClient('http://localhost:'+configs.port+"?type=build-stream&id="+roomId);
      client.on('data', function(data) {
        expect(data.toString()).to.equal(testString);
        clientReadCount.next();
      })
      client.on('open', function(data) {
        clientOpenCount.next();
      })
    };

    function sendData () {
      var sendStream = new require('stream').Readable();
      sendStream.push(testString);
      sendStream.push(null);
      buildStream.sendBuildStream(roomId, sendStream);
    }
  });
});