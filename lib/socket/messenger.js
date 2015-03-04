'use strict';

var debug = require('debug')('runnable-api:socket:messenger');
var dogstatsd = require('../models/datadog');
var uuid = require('uuid');
var Context = require('models/mongo/context');
var error = require('error');

var baseDataName = 'api.socket.messenger';

function Messenger () {}

Messenger.prototype.setServer = function (server) {
  if (!server) { throw new Error('Messenger needs server'); }
  this.server = server;
};

Messenger.prototype.messageRoom = function (type, name, data) {
  if (!this.server) {
    throw new Error('setServer has not been called yet');
  }
  debug('messageRoom', name, type, data);
  this.server.room(genRoomName(type, name)).write({
    id: uuid(),
    event: 'ROOM_MESSAGE',
    type: type,
    name: name,
    data: data
  });
};

Messenger.prototype.joinRoom = function (socket, type, name) {
  socket.join(genRoomName(type, name));
};

Messenger.prototype.leaveRoom = function (socket, type, name) {
  socket.leave(genRoomName(type, name));
};

Messenger.prototype.emitImagePulling = function (instance, stream) {
  debug('emitImagePulling');
  var self = this;
  stream.on('data', function(data) {
    self.messageRoom('org', instance.owner.github, {
      event: 'INSTANCE_PULLING',
      id: instance._id,
      data: data
    });
  });
};

/**
 * emit instnce update event
 * @param  {object}   instance instance to send
 * @param  'string'   action   valid actions
 *   start, stop, restart, update, redeploy, deploy, delete, patch, post
 */
Messenger.prototype.emitInstanceUpdate = function (instance, action) {
    debug('emitInstanceUpdate');
    var self = this;
    if (!instance || !instance.owner || !instance.owner.github || !action) {
      throw new Error('emitInstanceUpdate missing inputs');
    }
    self.messageRoom('org', instance.owner.github, {
      event: 'INSTANCE_UPDATE',
      action: action,
      data: instance
    });
};

/**
 * emit instnce update event
 * @param  {object}   contextVersion instance to send
 * @param  'string'   action   valid actions
 *   build_started, build_running, build_complete
 */
Messenger.prototype.emitContextVersionUpdate = function (contextVersion, action) {
    debug('emitContextVersionUpdate');
    var self = this;
    if (!contextVersion ||
      !contextVersion.createdBy ||
      !contextVersion.createdBy.github ||
      !action) {
      throw new Error('emitContextVersionUpdate missing inputs');
    }
    Context.findById(contextVersion.context, {owner:1}, function (err, context) {
      if (err) { return error.log(err); }
      self.messageRoom('org', context.owner.github, {
        event: 'CONTEXTVERSION_UPDATE',
        action: action,
        data: contextVersion
      });
    });
};


/*jshint maxcomplexity:20*/
Messenger.prototype.subscribeStreamHandler = function (socket, id, data) {
  dogstatsd.increment(baseDataName+'.connections');
  // check required args
  if (!data.name ||
    !data.type ||
    !data.action) {
    dogstatsd.increment(baseDataName+'.err.invalid_args');
    return socket.write({
      id: id,
      error: 'name, type and action are required',
      data: data
    });
  }

  if (~data.action.indexOf('join')) {
    this.joinRoom(socket, data.type, data.name);
  } else if (~data.action.indexOf('leave')) {
    this.leaveRoom(socket, data.type, data.name);
  } else {
    return socket.write({
      id: id,
      error: 'invalid action',
      data: data
    });
  }

  debug('subscribeStreamHandler', data.name, data.type, data.action);
  socket.write({
    id: id,
    event: 'ROOM_ACTION_COMPLETE',
    data: {
      type: data.type,
      name: data.name,
      action: data.action
    }
  });
};

function genRoomName(type, name) {
  return process.env.MESSENGER_NAMESPACE+type+':'+name;
}

module.exports = new Messenger();
