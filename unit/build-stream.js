require('loadenv')();
var Lab = require('lab');
var describe = Lab.experiment;
var it = Lab.test;
var expect = Lab.expect;
var before = Lab.before;
var after = Lab.after;
var fs = require('fs');
var createCount = require('callback-count');
var timers = require("timers");
var uuid = require('uuid');
var buildStream = require('../lib/socket/build-stream.js');
var socketServer = require('../lib/socket/socket-server.js');
var MockStream = require('./fixtures/mockreadwritestream.js');
var faker = require('faker');

var testFile = './test.txt';
var Primus = require('primus');
var http = require('http');
var buildServer;
var responseCounter;
var buildWriteCounter;
var clientServer;
var primusClient = Primus.createSocket({
  transformer: process.env.PRIMUS_TRANSFORMER,
  plugin: {
    'substream': require('substream')
  },
  parser: 'JSON'
});

var testData;
var buildstreams;
var clients;
var clientDoneCount;

function createBuildStream(streamId, num) {
  buildstreams[streamId] = new MockStream();
  testData[streamId] = faker.Lorem.sentence(num).split(' ');
  return buildstreams[streamId]
}

function createBuildResponse(streamId, cb, endCb) {
  buildWriteCounter[streamId] = 0;
  var interval = timers.setInterval( function () {
    var testDataArray = testData[streamId];
    if (buildWriteCounter[streamId] < testDataArray.length) {
      writeOnBuildStream(streamId, cb);
    } else {
      buildstreams[streamId].end('Build Successful');
      timers.clearInterval(interval);
      if (endCb) {
        endCb();
      }
    }
  }, 300);
}

function writeOnBuildStream(streamId, cb) {
  buildstreams[streamId].write(testData[streamId][buildWriteCounter[streamId]++], cb);
}

function createClient(clientId, streamId) {
  var client = new primusClient('http://localhost:'+process.env.PORT);
  responseCounter[clientId] = 0;
  client.substream(clientId).on('data', handleData(clientId, streamId));
  client.on('open', requestBuildStream(client, clientId));
  client.on('data', checkResponse);
  clients[clientId] = client;
  return client;
}

function requestBuildStream(client, roomId) {
  return function() {
    client.write({
      id: 1,
      event: 'build-stream',
      data: {
        id: roomId,
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
}
function handleData(clientId, streamId) {
  return function(data) {
    if (data.toString() !== testData[streamId][responseCounter[clientId]]) {
      console.log('*** Failure clientId ', clientId, streamId)
    }
    expect(data.toString()).to.equal(testData[streamId][responseCounter[clientId]++]);
    if (responseCounter[clientId] === testData[streamId].length) {
      clients[clientId].end();
      clientDoneCount.next();
    }
  };
}


/**
 * What all needs to be tested
 *
 * One client with one build
 *
 * N clients with one build
 *
 * N clients with N builds
 *
 * Client connected through entire build, no logs, full stream
 *
 * Client connected n-way through, some logs
 *
 * Client connected at finish, all logs, no stream
 *
 * 2 clients connecting offset times (1 beginning, 1 n-way through)
 *
 *
 */
describe('build-stream', function () {
  var primusServer;

  before(function (done) {
    testData = [];
    clients = {};
    buildstreams = {};
    responseCounter = {};
    buildWriteCounter = {};
    clientServer = http.createServer();
    primusServer = socketServer.createSocketServer(clientServer);
    socketServer.addHandler('build-stream', buildStream.buildStreamHandler);
    clientServer.listen(process.env.PORT,done);
  });

  after(function (done) {
//    fs.unlinkSync(testFile);
    clientServer.close(done);
  });

  it('should setup n buildstreams to send data to 1 client each', {timeout: 500000}, function (done) {
    var numClients = 10;
    // Create BuildStreams
    clientDoneCount = createCount(numClients, done);
    for (var i = 0; i < numClients; i++) {
      var clientId = uuid();
      var streamId = uuid();
      var stream = createBuildStream(streamId, i);
      buildStream.sendBuildStream(clientId, stream);
      createClient(clientId, streamId);
      createBuildResponse(streamId);
    }
  });

  it('should setup 1 buildstreams to send data to n clients', {timeout: 500000}, function (done) {
    var numClients = 200;
    // Create BuildStreams
    var streamId = uuid();
    var stream = createBuildStream(streamId);
    clientDoneCount = createCount(numClients, done);
    for (var i = 0; i < numClients; i++) {
      var clientId = uuid();
      buildStream.sendBuildStream(clientId, stream);
      createClient(clientId, streamId);
    }
    timers.setTimeout(function() {
      createBuildResponse(streamId);
    }, 1000)
  });

//  it('should send data to all clients', {timeout: 500000}, function (done) {
//    var roomId = uuid();
//    var testString = "this is yet another message";
//    var numClients = 10000;
//    var clientOpenCount = createCount(numClients, function() {
//      sendData(testString, roomId);
//    });
//    var clientDoneCount = createCount(numClients, done);
//    var client;
//
//    for (var i = numClients - 1; i >= 0; i--) {
//      client = new primusClient('http://localhost:'+process.env.PORT);
//      client.substream(roomId).on('data', handleData(client));
//      client.on('open', requestBuildStream(client));
//      client.on('data', checkResponse);
//      if (i % 1000 == 0) {
//        console.log('running');
//      }
//    }
//    function requestBuildStream(client) {
//      return function() {
//        client.write({
//          id: 1,
//          event: 'build-stream',
//          data: {
//            id: roomId,
//            streamId: roomId
//          }
//        });
//      };
//    }
//    function checkResponse(message) {
//      if (message.error){
//        console.error("ERROR", message);
//        return done(message);
//      }
//      clientOpenCount.next();
//    }
//    function handleData(client) {
//      return function(data) {
//        expect(data.toString()).to.equal(testString);
//        console.log('receivingData');
//        clientDoneCount.next();
//        client.end();
//      };
//    }
//  });

//  it('should buffer data for second client', function (done) {
//    var roomId = uuid();
//    var client = new primusClient('http://localhost:'+process.env.PORT);
//    client.substream(roomId).on('data', handleData);
//    client.on('open', function() {
//      client.write({
//        id: 1,
//        event: 'build-stream',
//        data: {
//          id: roomId,
//          streamId: roomId
//        }
//      });
//    });
//
//    client.on('data', function(message) {
//      if (message.error) {
//        console.error("TEST ERROR", message);
//        client.end();
//        return done(message);
//      }
//      sendData(testString, roomId);
//    });
//
//    function handleData(data) {
//      expect(data.toString()).to.equal(testString);
//      client.end();
//      var client2 = new primusClient('http://localhost:'+process.env.PORT);
//      client2.substream(roomId).on('data', handleData2);
//      client2.on('open', function() {
//        client2.write({
//          id: 1,
//          event: 'build-stream',
//          data: {
//            id: roomId,
//            streamId: roomId
//          }
//        });
//      });
//
//      function handleData2 (data) {
//        expect(data.toString()).to.equal(testString);
//        client2.end();
//        done();
//      }
//    }
//  });

});