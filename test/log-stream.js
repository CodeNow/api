require('loadenv')();
var Lab = require('lab');
var describe = Lab.experiment;
var it = Lab.test;
var expect = Lab.expect;
var before = Lab.before;
var after = Lab.after;

var dock = require('./fixtures/dock');
var uuid = require('uuid');
var api = require('./fixtures/api-control');

var Primus = require('primus');
var primusClient = Primus.createSocket({
  transformer: process.env.PRIMUS_TRANSFORMER,
  plugin: {
    'substream': require('substream')
  },
  parser: 'JSON'
});


describe('Log Stream', function () {
  var ctx = {};

  before(api.start.bind(ctx));
  after(api.stop.bind(ctx));
  before(dock.start.bind(ctx));
  after(dock.stop.bind(ctx));

  it('should send data to all clients', function (done) {
    var containerId = uuid();
    var testString = "Just a bunch of text";
    var client = new primusClient('http://localhost:'+process.env.PORT);
    client.substream(containerId).on('data', handleData(client));
    client.on('open', requestLogStream(client));
    client.on('data', checkResponse);


    function requestLogStream(client) {
      return function() {
        client.write({
          id: 1,
          event: 'log-stream',
          data: {
            containerId: containerId,
            dockHost: 'localhost'
          }
        });
      };
    }
    function checkResponse(message) {
      console.log(message);
      if (message.error){
        console.error(message.error);
        console.error(new Error(message.error).stack);
        done(new Error(message));
      }
    }
    function handleData(client) {
      return function(data) {
        // Data seems to be coming back as a byte array, so use a buffer
        expect(new Buffer(data).toString()).to.equal(testString);
        client.end();
        done();
      };
    }
  });
});
