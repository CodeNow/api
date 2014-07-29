var Lab = require('lab');
var describe = Lab.experiment;
var it = Lab.test;
var before = Lab.before;
var beforeEach = Lab.beforeEach;
var afterEach = Lab.afterEach;
var after = Lab.after;
var api = require('./fixtures/api-control');
var createCount = require('callback-count');

var Primus = require('primus');
var Socket = Primus.createSocket({
  transformer: process.env.PRIMUS_TRANSFORMER,
  plugin: {
    'substream': require('substream')
  },
  parser: 'JSON'
});
var testServerPort = '3111';
var filibuster = require('Filibuster');
var http = require('http');

describe('Socket Server', { timeout: 5000 }, function () {
  var ctx = {};

  before(api.start.bind(ctx));
  after(api.stop.bind(ctx));

  beforeEach(function(done) {
    ctx.server = http.createServer();
    filibuster({
        httpServer: ctx.server
      });
    ctx.server.listen(testServerPort, done);
  });

  afterEach(function(done) {
    ctx.server.close(done);
  });

  describe('proxy test', function () {
    var terminalStream, eventStream;
    var primus;
    var containerId = '1c8feb1cc0e9';
    var pass = false;
    beforeEach(function (done) {
      pass = false;
      primus = new Socket('http://'+process.env.IPADDRESS+':'+process.env.PORT);

      terminalStream = primus.substream('terminalStream');
      eventStream = primus.substream('eventStream');

      primus.write({
        id: 1,
        event: 'terminal-stream',
        data: {
          dockHost: 'http://localhost:'+testServerPort,
          type: 'filibuster',
          containerId: containerId,
          terminalStreamId: 'terminalStream',
          eventStreamId: 'eventStream'
        }
      });
      done();
    });
    var check = function(errMsg, done) {
      primus.on('end', function () {
        if (pass) {
          return done();
        }
        return done(new Error(errMsg));
      });
    };
    it('should connect', function (done) {
      check('failed to connect', done);
      eventStream.on('data', function (data) {
        if(data.event === 'connected'){
          pass = true;
          primus.end();
        }
      });
    });

    it('should send event stream ping event', function (done) {
      check('echo failed to ping', done);
      eventStream.on('data', function (data) {
        if(data.event === 'pong') {
          pass = true;
          return primus.end();
        }
        eventStream.write({
          event: 'ping'
        });
      });
    });

    it('should send test command', function (done) {
      check('echo failed to run', done);
      terminalStream.on('data', function (data) {
        if(~data.indexOf('TEST')) {
          pass = true;
          return primus.end();
        }
        terminalStream.write('echo TEST\n');
      });
    });
  });
  describe('param validator', function() {
    var primus;
    var requiredParams = ['dockHost', 'type', 'containerId',
      'terminalStreamId', 'eventStreamId'];
    beforeEach(function (done) {
      pass = false;
      primus = new Socket('http://'+process.env.IPADDRESS+':'+process.env.PORT);
      done();
    });
    afterEach(function (done) {
      primus.on('end', done);
      primus.end();
    });
    it('should error if not all params sent', function (done) {
      var doneCount = createCount(done);
      var allParams = {
        dockHost: 'http://localhost:'+testServerPort,
        type: 'filibuster',
        containerId: 'containerId',
        terminalStreamId: 'terminalStream',
        eventStreamId: 'eventStream'
      };
      requiredParams.forEach(function(param, i) {
        doneCount.inc();
        var testParams = JSON.parse(JSON.stringify(allParams));
        delete testParams[param];
        primus.write({
          id: i,
          event: 'terminal-stream',
          data: testParams
        });
        primus.on('data', function(data) {
          if(data.id === i) {
            if(!data.error) {
              done(data.error);
            }
            doneCount.next();
          }
        });
      });
    });
  });
});
