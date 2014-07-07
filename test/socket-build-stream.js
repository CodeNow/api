var Lab = require('lab');
var describe = Lab.experiment;
var it = Lab.test;
var expect = Lab.expect;
var before = Lab.before;
var beforeEach = Lab.beforeEach;
var after = Lab.after;
var afterEach = Lab.afterEach;

var createCount = require('callback-count');
var configs = require('configs');
var uuid = require('uuid');
var buildStream = require('../lib/socket/build-stream.js');
var api = require('./fixtures/api-control');

var Primus = require('primus');
var primusClient = Primus.createSocket({
  transformer: configs.primus.transformer,
  plugin: {
    'substream': require('substream')
  },
  parser: 'JSON'
});

describe('Build Stream', function () {
  var ctx = {};

  before(api.start.bind(ctx));
  after(api.stop.bind(ctx));
  beforeEach(require('./fixtures/nock-runnable'));
  afterEach(require('./fixtures/clean-nock'));

  // TODO: test multi client once API start is fixed
  it('should send data to clients', function (done) {
    var roomId = uuid();
    var testString = "this is yet another message";
    var numClients = 1;
    var clientOpenCount = createCount(numClients, sendData);
    var clientReadCount = createCount(numClients, done);

    var client = new primusClient('http://'+configs.ipaddress+':'+configs.port+"?type=build-stream&id="+roomId);
    client.on('open', function() {
      clientOpenCount.next();
      client.on('end', function () {
        clientReadCount.next();
      });
      client.on('data', function(data) {
        expect(data.toString()).to.equal(testString);
        client.end();
      });
    });

    function sendData () {
      var sendStream = new require('stream').Readable();
      sendStream.push(testString);
      sendStream.push(null);
      buildStream.sendBuildStream(roomId, sendStream);
    }
  });
});
