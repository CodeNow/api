require('loadenv')();
var Lab = require('lab');
var describe = Lab.experiment;
var it = Lab.test;
var expect = Lab.expect;
var before = Lab.before;
var beforeEach = Lab.beforeEach;
var afterEach = Lab.afterEach;
var after = Lab.after;
var fs = require('fs');
var createCount = require('callback-count');
var timers = require("timers");
var uuid = require('uuid');
var noop = require('101/noop');
var buildStream = require('../lib/socket/build-stream.js');
var socketServer = require('../lib/socket/socket-server.js');
var MockStream = require('./fixtures/mockreadwritestream.js');
var faker = require('faker');
var redis = require('models/redis');
var redisClient = redis.createClient();
var Queue = require('async').queue;

var Primus = require('primus');
var http = require('http');
var buildServer;
var clientServer;
var primusClient = Primus.createSocket({
  transformer: process.env.PRIMUS_TRANSFORMER,
  plugin: {
    'substream': require('substream')
  },
  parser: 'JSON'
});

/**
 * What I need to do.
 *
 * Make
 * @param streamId
 * @param intervalTimeout
 * @param cb
 * @param endCb
 */


//
//function createBuildStreamInterval(streamId, interval, endCb) {
//  buildWriteCounter[streamId] = 0;
//  var streamQueue = new Queue(writeOnBuildStream, 1);
//  var intervalTimer = timers.setInterval( function () {
//    if (!testData[streamId]) {
//      console.log('shit');
//    } else {
//      timers.clearInterval(intervalTimer);
//    }
//    var logIndex = buildWriteCounter[streamId]++;
//    if (logIndex <= testData[streamId].length) {
//      streamQueue.push({streamId: streamId, buildWriteIndex: logIndex, interval:intervalTimer, endCb: endCb});
//    }
//  }, interval);
//}

//function writeOnBuildStream(task, cb) {
//  var logIndex = task.buildWriteIndex;
//  if (logIndex < testData[task.streamId].length) {
//    var dataToWrite = testData[task.streamId][logIndex];
//    mockStreams[task.streamId].write(dataToWrite);
//  } else if (logIndex === testData[task.streamId].length) {
//    timers.clearInterval(task.interval);
//    mockStreams[task.streamId].end('Build Successful');
//    buildStream.endBuildStream(task.streamId, noop);
//    if (task.endCb) {
//      task.endCb();
//    }
//  }
//  cb();
//}

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
 * Verify redis has been cleaned up
 * Verify the end message comes back from the socket with the log
 *
 */
describe('build-stream', function () {
  var primusServer;

  var testData;
  /**
   * Contains a map of Streams indexed by their id
   */
  var mockStreams;

  var buildIntervals;
  var buildWritingIntervals;

  var buildWritingQueue;
  /**
   * This object stores the responses from each mockstream
   */
  var responseCounter;
  /**
   * This maps each mockStream's counter for which word it should send (from the testData array)
   * to a mockStream's id
   */
  var buildWriteCounter;

  var clients;

  var clientsReceivedCounts;
  var clientsPerServer;


  /************** helper functions  ********************/


  function createBuildStream(streamId, num) {
    mockStreams[streamId] = new MockStream();
    // This makes an array of words with | before each word after the first.
    testData[streamId] = faker.Lorem.sentence(num).replace(/ /g, ' |').split(' ');
    clientsPerServer[streamId] = 0;
    buildWriteCounter[streamId] = 0;
    return mockStreams[streamId]
  }

  function createBuildResponse(streamId, intervalTimeout, cb, endCb) {
    buildIntervals[streamId] = timers.setInterval( function () {
      if (buildWriteCounter[streamId] === testData[streamId].length) {
        timers.clearInterval(buildIntervals[streamId]);
        mockStreams[streamId].end('Build Successful');
        buildStream.endBuildStream(streamId, endCb || noop);
      } else if (buildWriteCounter[streamId] < testData[streamId].length) {
        writeOnBuildStream(streamId, cb);
      }
    }, intervalTimeout || 50);
  }

  function createBuildResponse2(streamId, halfwayCb, endCb) {
    buildWriteCounter[streamId] = 0;
    clientsReceivedCounts[streamId] = [];
    var queue = new Queue(writeOnBuildStream, 1);
    var data = testData[streamId];
    buildWritingQueue[streamId] = queue;
    var halfway = data.length/2;
    // Add the startCb to the queue first.
    queue.pause();
    for (var i = 0; i < data.length; i++) {
      queue.push({
        streamId: streamId,
        isHalfway: (i === halfway),
        data: data[i]
      }, function(isHalfway) {
        if (isHalfway && halfwayCb) {
          halfwayCb(streamId);
        }
        var clientCount = clientsPerServer[streamId];
        if (clientCount > 0) {
          queue.pause();
          clientsReceivedCounts[streamId].push(createCount(clientCount, function() {
            queue.resume();
          }))
        }
      });
    }
    queue.drain = function() {
      mockStreams[streamId].end('Build Successful');
      buildStream.endBuildStream(streamId, endCb || function(err) {
        if (err) { console.log(err); }
      });
    };
    queue.resume();
  }

  function writeOnBuildStream(task, cb) {
    var streamId = task.streamId;
    buildWriteCounter[streamId]++;
    mockStreams[streamId].write(task.data);
    cb(task.isHalfway);
  }

  function createClient(clientId, streamId, clientDoneCount, done) {
    var client = new primusClient('http://localhost:'+process.env.PORT);
    clientsPerServer[streamId]++;
    responseCounter[clientId] = 0;
    client.substream(streamId).on('data', handleData(clientId, streamId, clientDoneCount));
    client.on('open', requestBuildStream(client, streamId));
    client.on('data', checkResponse(done));
    clients[clientId] = client;
    return client;
  }


  function requestBuildStream(client, streamId) {
    return function() {
      client.write({
        id: 1,
        event: 'build-stream',
        data: {
          id: streamId,
          streamId: streamId
        }
      });
    };
  }
  function checkResponse(done) {
    return function(message) {
      if (message.error){
        console.error("ERROR" +
          "", message);
        if (done) {
          return done(message);
        }
      }
    }
  }
  function handleData(clientId, streamId, clientDoneCount) {
    return function(data) {
      var buildWriteCountCache = buildWriteCounter[streamId];
      // If data starts with |, then it can't be listening from the beginning
      if (data.charAt(0) !== '|' &&  data.split('|').length > 1 ) {
        // If this client's counter is more than 1 off of the stream's counter, we are getting a log,
        // so let's catch it up.
        var log = testData[streamId].slice(0, buildWriteCountCache).join('');
        expect(data.toString()).to.equal(log);
        responseCounter[clientId] = buildWriteCountCache;
        clientsReceivedCounts[streamId][responseCounter[clientId]].next();
      } else {
        var resCount = responseCounter[clientId];
        if (data.toString() !== testData[streamId][resCount]) {
          console.log('*** Failure clientId ', clientId, streamId)
        }
        expect(data.toString()).to.equal(testData[streamId][responseCounter[clientId]++]);
        clientsReceivedCounts[streamId][resCount].next();
      }
      if (responseCounter[clientId] === testData[streamId].length) {
        clients[clientId].end();
        if (clientDoneCount) {
          clientDoneCount.next();
        }
      }
    };
  }

  /********************** Tests **********************/

  before(function (done) {
    redisClient.flushall();
    done();
  });

  beforeEach(function(done) {
    testData = {};
    clients = {};
    mockStreams = {};
    responseCounter = {};
    buildIntervals = {};
    buildWriteCounter = {};
    buildWritingQueue = {};
    clientsReceivedCounts = {};
    clientsPerServer = {};
    clientServer = http.createServer();
    primusServer = socketServer.createSocketServer(clientServer);
    socketServer.addHandler('build-stream', buildStream.buildStreamHandler);
    clientServer.listen(process.env.PORT,done);
  });

  afterEach(function (done) {
    clientServer.close(done);
  });

  after(function (done) {
    // Check to verify redis is cleaned up
    console.log('Checking Redis Cleanup (should take around 11 seconds)');
    timers.setTimeout(function() {
      console.log('Querying Redis now');
      redisClient.keys('*_data', function(err, keys) {
        if (keys.length > 0) {
          console.log(keys);
          done(new Error('Redis did not get completely cleaned up'));
        } else {
          done();
        }
      });
    }, process.env.REDIS_KEY_EXPIRES + 3000)
  });

  it('should setup 1 mockStream to send data to 1 client', {timeout: 100000000}, function (done) {
    // Create BuildStreams
    var clientDoneCount = createCount(1, done);
    var clientId = uuid();
    var streamId = uuid();
    var stream = createBuildStream(streamId, 5);
    buildStream.sendBuildStream(streamId, stream);
    createClient(clientId, streamId, clientDoneCount, done);
    createBuildResponse2(streamId);
  });

  it('should setup n mockStreams to send data to 1 client each', {timeout: 2000}, function (done) {
    var numClients = 10;
    // Create BuildStreams
    var clientDoneCount = createCount(numClients, done);
    for (var i = 0; i < numClients; i++) {
      var clientId = uuid();
      var streamId = uuid();
      var stream = createBuildStream(streamId, i);
      buildStream.sendBuildStream(streamId, stream);
      createClient(clientId, streamId, clientDoneCount, done);
      createBuildResponse2(streamId);
    }
  });

  it('should setup 1 mockStream to send data to n clients', {timeout: 5000}, function (done) {
    // If this one fails
    var numClients = 20;
    // Create BuildStreams
    var streamId = uuid();
    buildWriteCounter[streamId] = 0;
    var stream = createBuildStream(streamId);
    buildStream.sendBuildStream(streamId, stream);
    var clientDoneCount = createCount(numClients, done);
    for (var i = 0; i < numClients; i++) {
      var clientId = uuid();
      createClient(clientId, streamId, clientDoneCount, done);
    }
    createBuildResponse2(streamId);
  });

  it('should allow 1 client connecting in the middle of the build to get everything',
    {timeout: 1500}, function (done) {
      // Create BuildStreams
      var clientDoneCount = createCount(1, done);
      var clientId = uuid();
      var streamId = uuid();
      var stream = createBuildStream(streamId, 10);
      buildStream.sendBuildStream(streamId, stream);
      createBuildResponse2(streamId, function() {
        createClient(clientId, streamId, clientDoneCount, done);
      }, 50)
    });

  it('should allow 1 client to connect after the build to get everything (via logs)',
    {timeout: 1000}, function (done) {
      // Create BuildStreams
      var clientId = uuid();
      var streamId = uuid();
      var stream = createBuildStream(streamId, 5);
      buildStream.sendBuildStream(streamId, stream);
      createBuildResponse2(streamId, null, function() {
        var client = createClient(clientId, streamId);
        client.on('data', function (message) {
          if (message.event === 'BUILD_STREAM_CREATED') {
            // ignore
          } else if (message.event === 'BUILD_STREAM_ENDED') {
            var log = testData[streamId].join('');
            expect(message.data.log).to.equal(log);
            client.end();
            done();
          } else {
            client.end();
            done(new Error('The client never received anything back'));
          }
        });
      });
    });

  it('should have 2 clients connect at different times and still receive all of the data',
    {timeout: 2000}, function (done) {
      // Create BuildStreams
      var clientDoneCount = createCount(2, done);
      var streamId = uuid();
      buildWriteCounter[streamId] = 0;
      var stream = createBuildStream(streamId, 10);
      buildStream.sendBuildStream(streamId, stream);
      createClient(uuid(), streamId, clientDoneCount, done);
      createBuildResponse2(streamId);
      // The buildstream should now be writing data
      timers.setTimeout(function() {
        createClient(uuid(), streamId, clientDoneCount, done);
      }, 50)
    });
});