var Lab = require('lab');
var describe = Lab.experiment;
var it = Lab.test;
var before = Lab.before;
var beforeEach = Lab.beforeEach;
var afterEach = Lab.afterEach;
var after = Lab.after;
var api = require('./fixtures/api-control');
var dockerServer = require('./fixtures/docker.js');
var Docker = require('dockerode');
var docker = new Docker({
  host: 'http://localhost',
  port: 4242
});
var Primus = require('primus');
var Socket = Primus.createSocket({
  transformer: process.env.PRIMUS_TRANSFORMER,
  plugin: {
    'substream': require('substream')
  },
  parser: 'JSON'
});
var testServerPort = 3333;
var filibuster = require('Filibuster');
var http = require('http');

describe('Socket Server', { timeout: 5000 }, function () {
  var ctx = {};

  before(api.start.bind(ctx));
  after(api.stop.bind(ctx));

  before(dockerServer.start.bind(ctx, 4242));

  var container;
  before(function (done) {
    docker.createContainer({}, function (err, c) {
      if (err) { return done(err); }
      container = c;
      container.start(done);
    });
  });

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

  describe('Terminal test', function () {
    var primus;
    var pass = false;
    beforeEach(function (done) {
      pass = false;
      primus = new Socket('http://localhost' +
        ':'+testServerPort+'?type=filibuster&args={"containerId": "'+container.id+'"}');
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
    it('connect', function (done) {
      check('failed to connect', done);
      primus.on('data', function (data) {
        if(data.name === 'terminal'){
          pass = true;
          return primus.end();
        }
      });
    });
    it('send term command', function (done) {
      var term = primus.substream('terminal');
      check('echo failed to run', done);
      term.on('data', function (data) {
        if(~data.indexOf('TEST')) {
          pass = true;
          return primus.end();
        }
        term.write('echo TEST\n');
      });
    });
    it('send clientEventsStream ping event', function (done) {
      var cs = primus.substream('clientEvents');
      check('echo failed to ping', done);
      cs.on('data', function (data) {
        if(data.event === 'pong') {
          pass = true;
          return primus.end();
        }
        cs.write({
          event: 'ping'
        });
      });
    });
  });
});
