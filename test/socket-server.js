var Lab = require('lab');
var describe = Lab.experiment;
var it = Lab.test;
var before = Lab.before;
var beforeEach = Lab.beforeEach;
var after = Lab.after;
var configs = require('configs');
var api = require('./fixtures/api-control');
var Primus = require('primus');
var Socket = Primus.createSocket({
  transformer: configs.primus.transformer,
  plugin: {
    'substream': require('substream')
  },
  parser: 'JSON'
});

describe('Socket Server', { timeout: 5000 }, function () {
  var ctx = {};

  before(api.start.bind(ctx));
  after(api.stop.bind(ctx));

  describe('Terminal test', function () {
    var primus;
    var pass = false;
    beforeEach(function (done) {
      pass = false;
      primus = new Socket('http://'+configs.ipaddress+':'+configs.port+"?type=filibuster");
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
          event: "ping"
        });
      });
    });
  });
});
