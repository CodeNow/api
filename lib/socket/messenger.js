'use strict';
var debug = require('debug')('runnable-api:socket:messenger');

module.exports = Messenger;

function Messenger (socket) {
  if (!socket) { throw new Error('Messenger needs socket'); }
  this.socket = socket;
}

Messenger.prototype.emit = function (data, cb) {
  if (this.socket.writable) {
    this.socket.write(data);
  }
  cb();
};

Messenger.prototype.emitImagePulling = function (cb) {
  debug('emitImagePulling');
  this.emit({
    event: 'IMAGE_PULLING'
  }, cb);
};
