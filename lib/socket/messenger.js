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

Messenger.prototype.emit = function (room, data, cb) {
  this.server.room(room).write({
    id: uuid(),
    event: 'ROOM_MESSAGE',
    room: room,
    data: data
  });
  cb();
};

Messenger.prototype.emitImagePulling = function (session, cb) {
  debug('emitImagePulling');
  this.emit(session, {
    event: 'IMAGE_PULLING'
  }, cb);
};

Messenger.prototype.subscribeStreamHandler = function (socket, id, data) {
  dogstatsd.increment(baseDataName+'.connections');
  // check required args
  if (!data.room ||
    !data.type) {
    dogstatsd.increment(baseDataName+'.err.invalid_args');
    return socket.write({
      id: id,
      error: 'room and type are required',
      data: data
    });
  }

  socket.join(data.type+ ':' + data.room);

  // return to client id to listen too
  socket.write({
    id: id,
    event: 'ROOM_JOINED',
    data: {
      substreamId: data.containerId
    }
  });
};



var messenger = new Messenger();
module.exports = messenger;
