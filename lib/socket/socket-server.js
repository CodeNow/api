/**
 * @module lib/socket/socket-server
 */
'use strict';

var Primus = require('primus');
var debug = require('debug')('runnable-api:socket:socket-server');
var domain = require('domain');
var envIs = require('101/env-is');
var keypather = require('keypather')();

var buildStream = require('socket/build-stream');
var dogstatsd = require('models/datadog');
var logStream = require('socket/log-stream');
var messenger = require('socket/messenger');
var passport = require('middlewares/passport');
var primusProxy = require('socket/terminal-stream');

module.exports = SocketServer;

var baseDataName = 'api.socket.server';
var handlers = {};

/**
 * Orchestrate primus/socket API functionality (build logs, container logs, etc)
 * @class
 * @param {String} server
 * @return null
 */
function SocketServer (server) {
  if (!server) {
    throw new Error('no server passed into socker creater');
  }
  var options = {
    redis: {
      host: process.env.REDIS_IPADDRESS,
      port: process.env.REDIS_PORT
    },
    transformer: process.env.PRIMUS_TRANSFORMER,
    origins: (envIs('production') ? process.env.DOMAIN : '*')
  };
  this.primus = new Primus(server, options);
  messenger.setServer(this.primus);

  this.primus.use('redis', require('primus-redis-rooms'));
  this.primus.use('substream', require('substream'));
  this.primus.before(require('middlewares/domains'));
  this.primus.before(require('middlewares/session'));
  this.primus.before(passport.initialize({ userProperty: 'sessionUser' }));
  this.primus.before(passport.session());

  this.addHandler('build-stream', buildStream.buildStreamHandler);
  this.addHandler('log-stream', logStream.logStreamHandler);
  this.addHandler('terminal-stream', primusProxy.proxyStreamHandler);
  this.addHandler('subscribe', messenger.subscribeStreamHandler.bind(messenger));
  // handle connection
  this.primus.on('connection', function (socket) {
    var userId = keypather.get(socket, 'request.session.passport.user');
    if (!userId && !envIs('test')) {
      dogstatsd.increment(baseDataName+'.err.noUser');
      return socket.write({
        error: 'not logged in, try again'
      });
    }

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
  if (message && message.id &&
    typeof message.event === 'string') {
    if(message.data && typeof message.data !== 'object') {
      return false;
    }
    return true;
  }
  return false;
}
