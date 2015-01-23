'use strict';
var debug = require('debug')('runnable-api:socket:messenger');
var dogstatsd = require('../models/datadog');
var baseDataName = 'api.socket.messenger';
var uuid = require('uuid');
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

Messenger.prototype.emitImagePulling = function (org, id, stream, cb) {
  debug('emitImagePulling');
  var self = this;
  stream.on('data', function(data) {
    self.messsageRoom('org', org, {
      event: 'IMAGE_PULLING',
      id: id,
      data: data
    });
  });
  cb();
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
    event: 'ROOM_JOINED',
    data: {
      type: data.type,
      name: data.name
    }
  });
};

function genRoomName(type, name) {
  return process.env.MESSENGER_NAMESPACE+type +':'+name;
}

module.exports = new Messenger();
