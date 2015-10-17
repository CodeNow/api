'use strict';

var Code = require('code');
var createCount = require('callback-count');
var expect = Code.expect;

var uuid = require('uuid');
var expects = require('./expects');
var logger = require('middlewares/logger')(__filename);
var isFunction = require('101/is-function');
var Primus = require('primus');
var Socket = Primus.createSocket({
  transformer: process.env.PRIMUS_TRANSFORMER,
  plugin: {
    'substream': require('substream')
  },
  parser: 'JSON'
});

var log = logger.log;

var ctx = {};

module.exports = {
  joinOrgRoom: function (orgId, cb) {
    log.trace('joinOrgRoom', orgId);
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
    ctx.primus.on('data', function onData (data) {
      if (data.event === 'ROOM_ACTION_COMPLETE') {
        ctx.primus.removeListener('data', onData);
        cb();
      }
    });
  },
  connect: function (cb) {
    log.trace('connect');
    var token = process.env.PRIMUS_AUTH_TOKEN;
    var url = process.env.FULL_API_DOMAIN + '?token=' + token;
    ctx.primus = new Socket(url);
    ctx.primus.on('error', function (err) {
      console.error(
        'PRIMUS CONNECTION ERROR', process.env.ROOT_DOMAIN, err);
    });
    ctx.primus.on('reconnect', function () {
      console.error(
        'PRIMUS RECONNECT ATTEMPT', process.env.ROOT_DOMAIN, arguments);
    });
    ctx.primus.once('open', cb);
  },
  disconnect: function (cb) {
    log.trace('disconnect');
    if (!ctx.primus) { return cb(new Error('can not disconnect primus if not connected')); }
    ctx.primus.once('end', cb);
    ctx.primus.end();
  },
  onceRoomMessage: function (event, action, cb) {
    log.trace('onceRoomMessage');
    if (!ctx.primus) { return cb(new Error('can not primus.onceRoomMessage if not connected')); }
    ctx.primus.on('data', function handler (data) {
      log.trace(data.event === 'ROOM_MESSAGE',
        data.data.event, data.data.action,
        event, action);
      if (data.event === 'ROOM_MESSAGE' &&
          data.data.event === event &&
          data.data.action === action) {
        ctx.primus.removeListener('data', handler);
        cb(data);
      }
    });
  },
  expectAction: function(action, expected, cb) {
    log.trace('expectAction');
    if (isFunction(expected)) {
      cb = expected;
      expected = null;
    }
    if (!ctx.primus) { return cb(new Error('can not primus.expectAction if not connected')); }
    ctx.primus.on('data', function check (data) {
      log.trace('primus expect:',
        'ROOM_MESSAGE', action,
        data.event, data.data.action);
      if (data.event === 'ROOM_MESSAGE' && data.data.action === action) {
        log.trace('primus expected data:', expected, data.data.data);
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
  expectActionCount: function (action, count, cb) {
    log.trace('expectActionCount', action, count);
    var cbCount = createCount(count, done);
    ctx.primus.on('data', handleData);
    function handleData (data) {
      if (data.event === 'ROOM_MESSAGE' && data.data.action === action) {
        log.trace('expectActionCount', action, cbCount.count);
        cbCount.next();
      }
    }
    function done () {
      ctx.primus.removeListener('data', handleData);
      cb();
    }
  },
  onceInstanceUpdate: function (instanceId, action, cb) {
    log.trace('onceInstanceUpdate');
    var self = this;
    if (typeof instanceId === 'function') {
      cb = instanceId;
      instanceId = null;
    }
    else {
      instanceId = instanceId.toString();
    }
    this.onceRoomMessage('INSTANCE_UPDATE', action, handler);
    function handler (data) {
      if (!instanceId) {
        cb(data);
      }
      else if (data.data.data._id.toString() === instanceId) {
        cb(data);
      }
      else { // keep listening
        self.onceRoomMessage('INSTANCE_UPDATE', action, handler);
      }
    }
  },
  onceVersionComplete: function (versionId, cb) {
    log.trace('onceVersionComplete');
    var self = this;
    if (typeof versionId === 'function') {
      cb = versionId;
      versionId = null;
    }
    else {
      versionId = versionId.toString();
    }
    this.onceRoomMessage('CONTEXTVERSION_UPDATE', 'build_completed', handler);
    function handler (data) {
      if (data instanceof Error) {
        throw data;
      }
      if (!versionId) {
        cb(data);
      }
      else if (data.data.data._id.toString() === versionId) {
        cb(data);
      }
      else { // keep listening
        self.onceRoomMessage('CONTEXTVERSION_UPDATE', 'build_completed', handler);
      }
    }
  }
};
