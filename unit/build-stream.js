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
 * 2 clients with one disconnecting in the middle
 *
 * 1 client disconnecting in the middle
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

  var resultStrings = {};

  /************** helper functions  ********************/


  function createBuildStream(streamId, num) {
    var number = num || 20;
    mockStreams[streamId] = new MockStream();
    // This makes an array of words with | before each word after the first.
    testData[streamId] = faker.Lorem.sentence(number).replace(/ /g, ' |').split(' ')
      .splice(0, number);
    clientsPerServer[streamId] = 0;
    buildWriteCounter[streamId] = 0;
    resultStrings[streamId] = {};
    return mockStreams[streamId];
  }

  function createBuildResponse2(streamId, halfwayCb, endCb) {
    buildWriteCounter[streamId] = 0;
    clientsReceivedCounts[streamId] = [];
    var queue = new Queue(writeOnBuildStream, 1);
    var data = testData[streamId];
    var halfway = Math.floor(data.length/2);
    // Add the startCb to the queue first.
    queue.pause();
    for (var i = 0; i <= data.length; i++) {
      queue.push({
        streamId: streamId,
        halfway: (i === halfway),
        final: (i === data.length),
        data: data[i]
      }, onQueueCallback(queue, streamId, halfwayCb, endCb));
    }
    queue.resume();
  }

  function onQueueCallback(queue, streamId, halfwayCb, endCb) {
    return function(halfway, final) {
      if (halfway && halfwayCb) {
        halfwayCb(streamId);
      } else if (final) {
        if (endCb) {
          endCb();
        }
        return;
      }
      var clientCount = clientsPerServer[streamId];
      queue.pause();
      if (clientCount > 0) {
        clientsReceivedCounts[streamId].push(createCount(clientCount, function() {
          if (clientsReceivedCounts[streamId]) {
            clientsReceivedCounts[streamId].pop();
          }
          queue.resume();
        }));
      } else {
        timers.setTimeout(function() {
          queue.resume();
        }, 50);
      }
    };
  }

  function writeOnBuildStream(task, cb) {
    var streamId = task.streamId;
    if (mockStreams[streamId]) {
      if (task.final) {

        mockStreams[streamId].end('Build Successful');
        buildStream.endBuildStream(streamId, function (err) {
          if (err) {
            console.log(err);
          }
        });
      } else {
        buildWriteCounter[streamId]++;
        mockStreams[streamId].write(task.data);
      }
    }

    cb(task.halfway, task.final);
  }

  function createClient(clientId, streamId, clientDoneCount, done) {
    var client = new primusClient('http://localhost:'+process.env.PORT);
    clientsPerServer[streamId]++;
    responseCounter[clientId] = 0;
    resultStrings[streamId][clientId] = '';
    client.substream(streamId).on('data',
      handleData(clientId, streamId, testData[streamId], clientDoneCount));
    client.on('open', requestBuildStream(client, streamId));
    client.on('data', checkResponse(done));
    clients[clientId] = client;
    return client;
  }

  function deleteClient(clientDoneCount, clientId, streamId) {
    clientsPerServer[streamId]--;
    if (clientsReceivedCounts[streamId].length > 0) {
      clientsReceivedCounts[streamId][0].next();
    }

    clients[clientId].end();
    if (clientDoneCount) {
      clientDoneCount.next();
    }
    delete responseCounter[clientId];
    delete resultStrings[streamId][clientId];
    delete clients[clientId];
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
    };
  }
  function handleData(clientId, streamId, expectedData, clientDoneCount) {
    return function(data) {
      if (responseCounter[clientId] === null) {
        return;
      }

      expect(data).to.be.ok;
      resultStrings[streamId][clientId] += data;
      var dataArray = data.split('|');
      if (dataArray[0] === '') { dataArray.pop();}
      responseCounter[clientId] += dataArray.length;
      if (clientsReceivedCounts[streamId].length > 0) {
        clientsReceivedCounts[streamId][0].next();
      }
      if (responseCounter[clientId] === expectedData.length) {
        // Check if the result string matches the

        if (resultStrings[streamId][clientId] !== expectedData.join('')) {
          console.log('Uh oh');
        }
        expect(resultStrings[streamId][clientId]).to.equal(expectedData.join(''));

        clients[clientId].end();
        if (clientDoneCount) {
          clientDoneCount.next();
        }
      }
    };
  }

  /********************** Tests **********************/

  before(function (done) {
    if (process.env.NODE_ENV !== 'production') {
      redisClient.flushall();
    }

    clientServer = http.createServer();
    primusServer = socketServer.createSocketServer(clientServer);
    socketServer.addHandler('build-stream', buildStream.buildStreamHandler);
    clientServer.listen(process.env.PORT,done);
  });

  beforeEach(function(done) {
    testData = {};
    clients = {};
    mockStreams = {};
    responseCounter = {};
    buildIntervals = {};
    buildWriteCounter = {};
    clientsReceivedCounts = {};
    clientsPerServer = {};
    done();
  });

  afterEach(function(done) {
    for (var id in clients) {
      if (clients.hasOwnProperty(id)) {
        clients[id].end();
      }
    }
    done();
  });

  after(function (done) {
    if (clientServer) {
      clientServer.close();
    }
    if (process.env.NODE_ENV !== 'production') {
      checkRedisLeaks(done);
    }
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
    }, process.env.REDIS_KEY_EXPIRES + 3000);
  }

  it('should setup 1 mockStream to send data to 1 client', function (done) {
    // Create BuildStreams
    var clientDoneCount = createCount(1, done);
    var clientId = uuid();
    var streamId = uuid();
    var stream = createBuildStream(streamId, 5);
    buildStream.sendBuildStream(streamId, stream);
    createClient(clientId, streamId, clientDoneCount, done);
    createBuildResponse2(streamId);
  });

  it('should setup n mockStreams to send data to 1 client each', {timeout: 1000}, function (done) {
    var numClients = 100;
    // Create BuildStreams
    var clientDoneCount = createCount(numClients, done);
    for (var i = 0; i < numClients; i++) {
      var clientId = uuid();
      var streamId = uuid();
      var stream = createBuildStream(streamId, 10);
      buildStream.sendBuildStream(streamId, stream);
      createClient(clientId, streamId, clientDoneCount, done);
      createBuildResponse2(streamId);
    }
  });

  /**
   * For the above and below tests....
   * When the number of clients/buildStreams goes over 9000, there seems to be a lot of instability
   * issues.  We may need to investigate this further
   */
  it('should setup 1 mockStream to send data to n clients', {timeout: 1000}, function (done) {
    // If this one fails
    var numClients = 100;
    // Create BuildStreams
    var streamId = uuid();
    buildWriteCounter[streamId] = 0;
    var stream = createBuildStream(streamId, 30);
    buildStream.sendBuildStream(streamId, stream);
    var clientDoneCount = createCount(numClients, done);
    for (var i = 0; i < numClients; i++) {
      var clientId = uuid();
      createClient(clientId, streamId, clientDoneCount, done);
    }
    createBuildResponse2(streamId);
  });

  it('should allow 1 client connecting in the middle of the build to get everything',
   {timeout: 1000}, function (done) {
    // Create BuildStreams
    var clientDoneCount = createCount(1, done);
    var clientId = uuid();
    var streamId = uuid();
    var stream = createBuildStream(streamId, 10);
    buildStream.sendBuildStream(streamId, stream);
    createBuildResponse2(streamId, function(streamId) {
      createClient(clientId, streamId, clientDoneCount, done);
    });
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
        if (message.event === 'BUILD_STREAM_ENDED') {
          var log = testData[streamId].join('');
          expect(message.data.log).to.equal(log);
          client.end();
          done();
        } else if (message.event !== 'BUILD_STREAM_CREATED') {
          client.end();
          done(new Error('The client never received anything back'));
        }
      });
    });
  });

  it('should have 2 clients connect at different times and still receive all of the data',
   function (done) {
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

  it('should have 1 clients who disconnects halfway',
    {timeout: 50000}, function (done) {
      // Create BuildStreams
      var streamId = uuid();
      var clientId = uuid();
      buildWriteCounter[streamId] = 0;
      var stream = createBuildStream(streamId, 10);
      buildStream.sendBuildStream(streamId, stream);
      createClient(clientId, streamId, null, done);
      createBuildResponse2(streamId, onHalfwayDisconnect(clientId, streamId, null, done));
  });

  it('should have n clients connect to 1 mockStream each, but all disconnect halfway',
   {timeout: 500000}, function (done) {
    var numClients = 100;
    // Create BuildStreams
    var clientDoneCount = createCount(numClients, done);
    for (var i = 0; i < numClients; i++) {
      var clientId = uuid();
      var streamId = uuid();
      var stream = createBuildStream(streamId, 100);
      buildStream.sendBuildStream(streamId, stream);
      createClient(clientId, streamId, null, done);
      createBuildResponse2(streamId, onHalfwayDisconnect(clientId, streamId, clientDoneCount, null));
    }
  });

  it('should setup n clients to connect to 1 stream, but disconnect halfway', {timeout: 500000},
   function (done) {
    // If this one fails
    var numClients = 100;
    // Create BuildStreams
    var streamId = uuid();
    buildWriteCounter[streamId] = 0;
    var stream = createBuildStream(streamId, 20);
    buildStream.sendBuildStream(streamId, stream);
    var clientDoneCount = createCount(numClients, done);
    for (var i = 0; i < numClients; i++) {
      var clientId = uuid();
      createClient(clientId, streamId, clientDoneCount, done);
    }
    createBuildResponse2(streamId, function() {
      for (var clientId in clients) {
        onHalfwayDisconnect(clientId, streamId, clientDoneCount, null)();
      }
    });
  });

  function onHalfwayDisconnect(clientId, streamId, clientDoneCount, done) {
    return function() {
      timers.setTimeout(function() {
        deleteClient(clientDoneCount, clientId, streamId);
        if (!clientDoneCount) {
          done();
        }
      }, 50);
    };
  }
});