require('loadenv')();
var Lab = require('lab');
var describe = Lab.experiment;
var it = Lab.test;
var expect = Lab.expect;
var before = Lab.before;
var beforeEach = Lab.beforeEach;
var afterEach = Lab.afterEach;
var after = Lab.after;
var createCount = require('callback-count');
var timers = require("timers");
var uuid = require('uuid');
var buildStream = require('../lib/socket/build-stream.js');
var socketServer = require('../lib/socket/socket-server.js');
var MockStream = require('./fixtures/mockreadwritestream.js');
var faker = require('faker');
var redis = require('models/redis');
var redisClient = redis.createClient();
var Queue = require('async').queue;

var Primus = require('primus');
var http = require('http');
var clientServer;
var primusClient = Primus.createSocket({
  transformer: process.env.PRIMUS_TRANSFORMER,
  plugin: {
    'substream': require('substream')
  },
  parser: 'JSON'
});

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

  var queues;


  /************** helper functions  ********************/


  function createBuildStream(streamId, num) {
    mockStreams[streamId] = new MockStream();
    // This makes an array of words with | before each word after the first.
    testData[streamId] = faker.Lorem.sentence(num).replace(/ /g, ' |').split(' ');
    clientsPerServer[streamId] = 0;
    buildWriteCounter[streamId] = 0;
    return mockStreams[streamId]
  }

  function createBuildResponse2(streamId, halfwayCb, endCb) {
    buildWriteCounter[streamId] = 0;
    clientsReceivedCounts[streamId] = [];
    var queue = new Queue(writeOnBuildStream, 1);
    var data = testData[streamId];
    queues[streamId] = queue;
    var halfway = Math.floor(data.length/2);
    // Add the startCb to the queue first.
    queue.pause();
    for (var i = 0; i <= data.length; i++) {
      queue.push({
        streamId: streamId,
        halfway: (i === halfway),
        final: (i === data.length),
        data: data[i]
      }, function(halfway, final) {
        if (halfway && halfwayCb) {
          halfwayCb(streamId);
        } else if (final && endCb) {
          return endCb();
        }
        var clientCount = clientsPerServer[streamId];
        queue.pause();
        if (clientCount > 0) {
          clientsReceivedCounts[streamId].push(createCount(clientCount, function() {
            clientsReceivedCounts[streamId].pop();
            queue.resume();
          }))
        } else {
          timers.setTimeout(function() {
            queue.resume();
          }, 50)
        }
      });
    }
    queue.resume();
  }

  function writeOnBuildStream(task, cb) {
    var streamId = task.streamId;
    if (task.final) {
      mockStreams[streamId].end('Build Successful');
      buildStream.endBuildStream(streamId, function(err) {
        if (err) { console.log(err); }
      });
    } else {
      buildWriteCounter[streamId]++;
      mockStreams[streamId].write(task.data);
    }
    cb(task.halfway, task.final);
  }

  function createClient(clientId, streamId, clientDoneCount, done) {
    var client = new primusClient('http://localhost:'+process.env.PORT);
    clientsPerServer[streamId]++;
    responseCounter[clientId] = 0;
    client.substream(streamId).on('data',
      handleData(clientId, streamId, testData[streamId], clientDoneCount));
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
  function handleData(clientId, streamId, logData, clientDoneCount) {
    return function(data) {
      var resCount = responseCounter[clientId];
      var buildWriteCountCache = buildWriteCounter[streamId];
      // If data starts with |, then it can't be listening from the beginning
      if (data.charAt(0) !== '|' &&  data.split('|').length > 1 ) {
        // If this client's counter is more than 1 off of the stream's counter, we are getting a log,
        // so let's catch it up.
        var log = logData.slice(0, buildWriteCountCache).join('');
        expect(data.toString()).to.equal(log);
        responseCounter[clientId] = buildWriteCountCache;
        clientsReceivedCounts[streamId][0].next();
      } else {
        if (data.toString() !== logData[resCount]) {
        }
        expect(data.toString()).to.equal(logData[responseCounter[clientId]++]);
        if (clientsReceivedCounts[streamId].length === 0) {
        }
        clientsReceivedCounts[streamId][0].next();
      }
      if (responseCounter[clientId] === logData.length) {
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

    clientServer = http.createServer();
    primusServer = socketServer.createSocketServer(clientServer);
    socketServer.addHandler('build-stream', buildStream.buildStreamHandler);
    clientServer.listen(process.env.PORT,done);
  });

  function clearAllInObject(object) {
    for(var i in object) {
      delete object[i];
    }
  }

  beforeEach(function(done) {
    testData = {};
    clients = {};
    mockStreams = {};
    responseCounter = {};
    buildIntervals = {};
    buildWriteCounter = {};
    clientsReceivedCounts = {};
    clientsPerServer = {};
    queues = {};
    done();
  });

  afterEach(function(done) {
//    console.log('After Each CALLED!!!')
    clearAllInObject(testData);
    clearAllInObject(clients);
    clearAllInObject(mockStreams);
    clearAllInObject(responseCounter);
    clearAllInObject(buildIntervals);
    clearAllInObject(clientsReceivedCounts);
    clearAllInObject(clientsPerServer);
    clearAllInObject(queues);
    done();
  });

  after(function (done) {
    clientServer.close(function () {
      checkRedisLeaks(done);
    });
  });

  function checkRedisLeaks(done) {
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
  }

  it('should setup 1 mockStream to send data to 1 client', {timeout: 5000000}, function (done) {
    // Create BuildStreams
    var clientDoneCount = createCount(1, done);
    var clientId = uuid();
    var streamId = uuid();
    var stream = createBuildStream(streamId, 5);
    buildStream.sendBuildStream(streamId, stream);
    createClient(clientId, streamId, clientDoneCount, done);
    createBuildResponse2(streamId);
  });

  it('should setup n mockStreams to send data to 1 client each', {timeout: 500000}, function (done) {
    var numClients = 1000;
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
    for (var i = 0; i < numClients; i++) {

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
    {timeout: 100000}, function (done) {
      // Create BuildStreams
      var clientDoneCount = createCount(1, done);
      var clientId = uuid();
      var streamId = uuid();
      var stream = createBuildStream(streamId, 10);
      buildStream.sendBuildStream(streamId, stream);
      createBuildResponse2(streamId, function(streamId) {
        createClient(clientId, streamId, clientDoneCount, done);
      })
    });

  it('should allow 1 client to connect after the build to get everything (via logs)',
    {timeout: 100000}, function (done) {
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
      createBuildResponse2(streamId, function(streamId) {
        createClient(uuid(), streamId, clientDoneCount, done);
      });
    });
});