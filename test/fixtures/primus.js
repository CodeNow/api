var Lab = require('lab');
var expect = Lab.expect;
var uuid = require('uuid');
var expects = require('./expects');
var Primus = require('primus');
var Socket = Primus.createSocket({
  transformer: process.env.PRIMUS_TRANSFORMER,
  plugin: {
    'substream': require('substream')
  },
  parser: 'JSON'
});

module.exports = {
  joinOrgRoom: function (orgId, cb) {
    ctx = this;
    ctx.primus.write({
      id: uuid(), // needed for uniqueness
      event: 'subscribe',
      data: {
        action: 'join',
        type: 'org',
        name: orgId, // org you wish to join
      }
    });
    ctx.primus.once('data', function(data) {
      if (data.event === 'ROOM_ACTION_COMPLETE') {
        cb();
      }
    });
  },
  connect: function (done) {
    ctx = this;
    ctx.primus = new Socket('http://localhost:'+process.env.PORT);
    ctx.primus.once('open', done);
  },
  disconnect: function (done) {
    ctx = this;
    if (!ctx.primus) { return done(); }
    ctx.primus.once('end', done);
    ctx.primus.end();
  },
  expectDeploy: function(expected, done) {
    ctx.primus.on('data', function(data) {
      if (data.event === 'ROOM_MESSAGE') {
        // this is these errors will bubble up in test
        expect(data.type).to.equal('org');
        expect(data.event).to.equal('ROOM_MESSAGE');
        expect(data.data.event).to.equal('INSTANCE_UPDATE');
        expects.expectKeypaths(data.data.data, expected);
        expect(data.data.action).to.equal('deploy');
        done();
      }
    });
  },
  expectDeployAndStart: function(expected, done) {
    var state = 0;
    ctx.primus.on('data', function(data) {
      if (data.event === 'ROOM_MESSAGE') {
        // this is these errors will bubble up in test
        expect(data.type).to.equal('org');
        expect(data.event).to.equal('ROOM_MESSAGE');
        expect(data.data.event).to.equal('INSTANCE_UPDATE');
        expects.expectKeypaths(data.data.data, expected);
        if(state === 0) {
          expect(data.data.action).to.equal('deploy');
          state = 1;
        } else if (state === 1) {
          expect(data.data.action).to.equal('start');
          done();
        }
      }
    });
  }
};