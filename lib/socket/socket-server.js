'use strict';
var debug = require('debug')('runnable-api:socket:socket-server');
var Primus = require('primus');
var handlers = {};
function createSocketServer (server) {
  if (!server) {
    throw new Error('no server passed into socker creater');
  }
  var socketServer = new Primus(server,
    {
      transformer: process.env.PRIMUS_TRANSFORMER,
      parser: 'JSON'
    });
  socketServer.use('substream', require('substream'));

  // handle connection
  socketServer.on('connection', function (socket) {
    debug('connection', socket.address);

    socket.on('data', function(message) {
      /* message has to be structured like so
        {
          id: 1
          event: 'string'
          data: {object}
        }
      */
      if(!isDataValid(message)) {
        return socket.write({
          error: 'invalid input',
          data: message
        });
      }
      // check events to ensure we support this one
      if(typeof handlers[message.event] !== 'function') {
        return socket.write({
          error: 'invalid event',
          data: message
        });
      }

      // run handler once all is good
      handlers[message.event](socket, message.id, message.data);
    });
  });

  return socketServer;
}

/** socket handlers have type and func
  type has to be a string.
  on a message if type matches event name the function is called
  func must be a function which has arguments like so
  func(socket, id, message.data);
  messages on the main socket stream must be of form
  {
    id: 1
    event: 'string'
    data: {object}
  }
*/
function addHandler(type, func) {
  handlers[type] = func;
}

function removeHandler(type) {
  delete handlers[type];
}

function isDataValid(message) {
  if (message &&
    typeof message.event === 'string' &&
    typeof message.id === 'number') {
    if(message.data && typeof message.data !== 'object') {
      return false;
    }
    return true;
  }
  return false;
}

module.exports.createSocketServer = createSocketServer;
module.exports.addHandler = addHandler;
module.exports.removeHandler = removeHandler;
