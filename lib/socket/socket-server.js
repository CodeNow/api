'use strict';
var debug = require('debug')('runnable-api:socket:socket-server');
var Primus = require('primus');
var handlers = {};
var dogstatsd = require('../models/datadog');
var baseDataName = 'api.socket.server';
var messenger = require('socket/messenger');

module.exports = SocketServer;

function SocketServer (server) {
  if (!server) {
    throw new Error('no server passed into socker creater');
  }
  this.primus = new Primus(server, {
      redis: {
      host: process.env.REDIS_IPADDRESS,
      port: process.env.REDIS_PORT
    },
    transformer: process.env.PRIMUS_TRANSFORMER,
    parser: 'JSON'
  });
    console.log('ananand');

  messenger.setServer(this.primus);

  this.primus.use('redis', require('primus-redis-rooms'));
  this.primus.use('substream', require('substream'));
  this.primus.before(require('middlewares/session'));

  // handle connection
  this.primus.on('connection', function (socket) {
    console.log('connection');
    socket.join(JSON.stringify(socket.request.session));
    socket.on('end', function() {
      console.log('leaving');
      socket.leave(JSON.stringify(socket.request.session));
    });
    dogstatsd.increment(baseDataName+'.connections');
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
        dogstatsd.increment(baseDataName+'.err.input');
        return socket.write({
          error: 'invalid input',
          data: message
        });
      }
      // check events to ensure we support this one
      if(typeof handlers[message.event] !== 'function') {
        dogstatsd.increment(baseDataName+'.err.invalid_event', ['event:'+message.event]);
        return socket.write({
          error: 'invalid event',
          data: message
        });
      }
      dogstatsd.increment(baseDataName+'.event', ['event:'+message.event]);
      // run handler once all is good
      handlers[message.event](socket, message.id, message.data);
    });
  });
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
SocketServer.prototype.addHandler = function (type, func) {
  handlers[type] = func;
};

SocketServer.prototype.removeHandler = function (type) {
  delete handlers[type];
};

function isDataValid (message) {
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