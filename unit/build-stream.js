var Lab = require('lab');
var describe = Lab.experiment;
var it = Lab.test;
var expect = Lab.expect;
var before = Lab.before;
var after = Lab.after;

var createCount = require('callback-count');
var configs = require('configs');
var uuid = require('uuid');
var buildStream = require('../lib/socket/build-stream.js');

var Primus = require('primus');
var http = require('http');
var httpServer;
var primusClient = Primus.createSocket({
  transformer: process.env.PRIMUS_TRANSFORMER,
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
        transformer: process.env.PRIMUS_TRANSFORMER,
        parser: 'JSON'
      });
    buildStream.attachBuildStreamHandelerToPrimus(primusServer);
    httpServer.listen(process.env.PORT);
    done();
  });

  after(function (done) {
    httpServer.close();
    done();
  });

  it('should send data to all clients', function (done) {
    var roomId = uuid();
    var testString = "this is yet another message";
    var numClients = 10;
    var clientOpenCount = createCount(numClients, sendData);
    var clientReadCount = createCount(numClients, done);

    for (var i = numClients - 1; i >= 0; i--) {
      var client = new primusClient('http://localhost:'+
        process.env.PORT+"?type=build-stream&id="+roomId);
      client.on('data', handleData);
      client.on('open',clientOpenCount.next);
    }
    function handleData(data) {
      expect(data.toString()).to.equal(testString);
      clientReadCount.next();
    }
    function sendData () {
      var sendStream = new require('stream').Readable();
      sendStream.push(testString);
      sendStream.push(null);
      buildStream.sendBuildStream(roomId, sendStream);
    }
  });
});