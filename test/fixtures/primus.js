'use strict';

var Code = require('code');
var expect = Code.expect;

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

var ctx;

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
    ctx.primus = new Socket('http://'+process.env.ROOT_DOMAIN);
    ctx.primus.once('open', done);
  },
  disconnect: function (done) {
    ctx = this;
    if (!ctx.primus) { return done(); }
    ctx.primus.once('end', done);
    ctx.primus.end();
  },
  expectAction: function(action, expected, done) {
    ctx = this;
    ctx.primus.on('data', function check (data) {
      if (data.event === 'ROOM_MESSAGE' && data.data.action === action) {
        expect(data.type).to.equal('org');
        expect(data.event).to.equal('ROOM_MESSAGE');
        expect(data.data.event).to.equal('INSTANCE_UPDATE');
        expects.expectKeypaths(data.data.data, expected);
        ctx.primus.removeListener('data', check);
        done();
      }
    });
  }
};
