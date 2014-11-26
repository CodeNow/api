'use strict';
var debug = require('debug')('runnable-api:socket:messenger');

function Messenger () {}

Messenger.prototype.setServer = function (server) {
  if (!server) { throw new Error('Messenger needs server'); }
  this.server = server;
};

Messenger.prototype.emit = function (session, data, cb) {
  this.server.room(session).write(data);
  cb();
};

Messenger.prototype.emitImagePulling = function (session, cb) {
  debug('emitImagePulling');
  this.emit(session, {
    event: 'IMAGE_PULLING'
  }, cb);
};

var messenger = new Messenger();
module.exports = messenger;
