require('loadenv')();
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
var socketServer = require('../lib/socket/socket-server.js');

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
    primusServer = socketServer.createSocketServer(httpServer);
    socketServer.addHandler('build-stream', buildStream.buildStreamHandler);
    httpServer.listen(process.env.PORT, done);
  });

  after(function (done) {
    fs.unlinkSync(testFile);
    httpServer.close(done);
  });

  it('should send data to all clients', function (done) {
    var roomId = uuid();
    var testString = "this is yet another message";
    var numClients = 10;
    var clientOpenCount = createCount(numClients, function() {
      sendData(testString, roomId);
    });
    var clientReadCount = createCount(numClients, done);
    var client;

    for (var i = numClients - 1; i >= 0; i--) {
      client = new primusClient('http://localhost:'+process.env.PORT);
      client.substream(roomId).on('data', handleData(client));
      client.on('open', requestBuildStream(client));
      client.on('data', checkResponse);
    }
    function requestBuildStream(client) {
      return function() {
        client.write({
          id: 1,
          event: 'build-stream',
          data: {
            id: roomId,
            build: {},
            streamId: roomId
          }
        });
      };
    }
    function checkResponse(message) {
      if (message.error){
        console.error("ERROR", message);
        return done(message);
      }
      clientOpenCount.next();
    }
    function handleData(client) {
      return function(data) {
        expect(data.toString()).to.equal(testString);
        clientReadCount.next();
        client.end();
      };
    }
  });

  it('should buffer data for second client', function (done) {
    var roomId = uuid();
    var testString = "this is yet another message";

    var client = new primusClient('http://localhost:'+process.env.PORT);
    client.substream(roomId).on('data', handleData);
    client.on('open', function() {
      client.write({
        id: 1,
        event: 'build-stream',
        data: {
          id: roomId,
          build: {},
          streamId: roomId
        }
      });
    });

    client.on('data', function(message) {
      if (message.error) {
        console.error("TEST ERROR", message);
        client.end();
        return done(message);
      }
      sendData(testString, roomId);
    });

    function handleData(data) {
      expect(data.toString()).to.equal(testString);
      client.end();
      var client2 = new primusClient('http://localhost:'+process.env.PORT);
      client2.substream(roomId).on('data', handleData2);
      client2.on('open', function() {
        client2.write({
          id: 1,
          event: 'build-stream',
          data: {
            id: roomId,
            build: {},
            streamId: roomId
          }
        });
      });

      function handleData2 (data) {
        expect(data.toString()).to.equal(testString);
        client2.end();
        done();
      }
    }
  });

});