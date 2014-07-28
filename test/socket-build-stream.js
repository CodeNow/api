require('loadenv')();
var Lab = require('lab');
var describe = Lab.experiment;
var it = Lab.test;
var expect = Lab.expect;
var before = Lab.before;
var after = Lab.after;
var testFile = './test.txt';
var fs = require('fs');

var createCount = require('callback-count');
var uuid = require('uuid');
var buildStream = require('../lib/socket/build-stream.js');
var api = require('./fixtures/api-control');

var Primus = require('primus');
var primusClient = Primus.createSocket({
  transformer: process.env.PRIMUS_TRANSFORMER,
  plugin: {
    'substream': require('substream')
  },
  parser: 'JSON'
});

function sendData (testString, roomId) {
  fs.writeFileSync(testFile, testString);
  buildStream.sendStream(roomId, fs.createReadStream(testFile));
}

describe('Build Stream', function () {
  var ctx = {};

  before(api.start.bind(ctx));
  after(api.stop.bind(ctx));
  after(function(done) {
    fs.unlink(testFile, done);
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
      client = new primusClient('http://'+process.env.IPADDRESS+':'+process.env.PORT);
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
});
