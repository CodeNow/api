'use strict';
var debug = require('debug')('runnable-api:socket:emitter');

var socket;

function attachSocket (sock) {
  socket = sock;
}

function emit (data) {
  if (socket.writable) {
    socket.write(data);
  }
}

function emitImagePulling () {
  debug('emitImagePulling');
  emit({
    event: 'IMAGE_PULLING'
  });
}


module.exports.emitImagePulling = emitImagePulling;
module.exports.emit = emit;
module.exports.attachSocket = attachSocket;
