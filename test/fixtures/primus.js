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

var ctx = {};

module.exports = {
  joinOrgRoom: function (orgId, cb) {
    if (!ctx.primus) { return cb(new Error('can not disconnect primus if not connected')); }
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
  connect: function (cb) {
    ctx.primus = new Socket('http://'+process.env.ROOT_DOMAIN);
    ctx.primus.once('open', cb);
  },
  disconnect: function (cb) {
    if (!ctx.primus) { return cb(new Error('can not disconnect primus if not connected')); }
    ctx.primus.once('end', cb);
    ctx.primus.end();
  },
  expectAction: function(action, expected, cb) {
    if (!ctx.primus) { return cb(new Error('can not disconnect primus if not connected')); }
    ctx.primus.on('data', function check (data) {
      if (data.event === 'ROOM_MESSAGE' && data.data.action === action) {
        expect(data.type).to.equal('org');
        expect(data.event).to.equal('ROOM_MESSAGE');
        expect(data.data.event).to.equal('INSTANCE_UPDATE');
        if (expected) {
          expects.expectKeypaths(data.data.data, expected);
        }
        ctx.primus.removeListener('data', check);
        cb(null, data);
      }
    });
  },
  waitForBuildComplete: function(cb) {
    if (!ctx.primus) { return cb(new Error('can not disconnect primus if not connected')); }
    ctx.primus.on('data', function check (data) {
      if (data.event === 'ROOM_MESSAGE' && data.data.action === 'build_complete') {
        expect(data.type).to.equal('org');
        expect(data.event).to.equal('ROOM_MESSAGE');
        expect(data.data.event).to.equal('CONTEXTVERSION_UPDATE');
        ctx.primus.removeListener('data', check);
        cb(null, data);
      }
    });
  }
};