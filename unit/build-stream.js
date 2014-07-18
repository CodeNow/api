var Lab = require('lab');
var describe = Lab.experiment;
var it = Lab.test;
var expect = Lab.expect;
var before = Lab.before;
var after = Lab.after;
var fs = require('fs');
var createCount = require('callback-count');
var uuid = require('uuid');
var buildStream = require('../lib/socket/build-stream.js');
var testFile = './test.txt';
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

function sendData (testString, roomId) {
  fs.writeFileSync(testFile, testString);
  buildStream.sendBuildStream(roomId, fs.createReadStream(testFile));
}

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
    fs.unlinkSync(testFile);
    done();
  });

  it('should send data to all clients', function (done) {
    var roomId = uuid();
    var testString = "this is yet another message";
    var numClients = 10;
    var clientOpenCount = createCount(numClients, function() {
      sendData(testString, roomId);
    });
    var clientReadCount = createCount(numClients, done);

    for (var i = numClients - 1; i >= 0; i--) {
      var client = new primusClient('http://localhost:'+
        process.env.PORT+"?type=build-stream&id="+roomId);
      client.on('data', handleData);
      client.on('open', clientOpenCount.next);
    }
    function handleData(data) {
      expect(data.toString()).to.equal(testString);
      clientReadCount.next();
    }
  });

  it('should buffer data for second client', function (done) {
    var roomId = uuid();
    var testString = "this is yet another message";

    var client = new primusClient('http://localhost:'+process.env.PORT+"?type=build-stream&id="+roomId);
    client.on('data', handleData);
    client.on('open', function() {
      sendData(testString, roomId);
    });

    function handleData(data) {
      expect(data.toString()).to.equal(testString);
      var client2 = new primusClient('http://localhost:'+process.env.PORT+"?type=build-stream&id="+roomId);
      client2.on('data', function(data) {
        expect(data.toString()).to.equal(testString);
        done();
      });
    }
  });

});