'use strict';
var debug = require('debug')('runnable-api:socket:socket-server');
var Primus = require('primus');
var handlers = {};
var dogstatsd = require('../models/datadog');
var baseDataName = 'api.socket.server';
var primusProxy = require('socket/terminal-stream.js');
var buildStream = require('socket/build-stream.js');
var logStream = require('socket/log-stream.js');
var messenger = require('socket/messenger.js');
var passport = require('middlewares/passport');
var keypather = require('keypather')();
var envIs = require('101/env-is');

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
  messenger.setServer(this.primus);

  this.primus.use('redis', require('primus-redis-rooms'));
  this.primus.use('substream', require('substream'));
  this.primus.before(require('middlewares/session'));
  this.primus.before(passport.initialize({ userProperty: 'sessionUser' }));
  this.primus.before(passport.session());

  this.addHandler('build-stream', buildStream.buildStreamHandler);
  this.addHandler('log-stream', logStream.logStreamHandler);
  this.addHandler('terminal-stream', primusProxy.proxyStreamHandler);
  this.addHandler('subscribe', messenger.subscribeStreamHandler);
  // handle connection
  this.primus.on('connection', function (socket) {
    var userId = keypather.get(socket, 'request.session.passport.user');
    if (!userId && !envIs('test')) {
      dogstatsd.increment(baseDataName+'.err.noUser');
      return socket.write({
        error: 'not logged in, try again'
      });
    }
    if (!envIs('test')){
      messenger.joinRoom(socket, 'user', userId);
    }
    messenger.joinRoom(socket, 'session', socket.request.sessionID);
    socket.on('end', function() {
      messenger.leaveRoom(socket, 'user', userId);
      messenger.leaveRoom(socket, 'session', socket.request.sessionID);
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