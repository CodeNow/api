'use strict';
var debug = require('debug')('runnable-api:socket:socket-server');
var Primus = require('primus');
var handlers = {};
var dogstatsd = require('../models/datadog');
var baseDataName = 'api.socket.server';
var redisClient = require('models/redis').createClient();
var REDIS_SOCKET_HEADER = 'socketConnection_';
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

  return socketServer;
}

function checkIfAlreadyConnected(socket, substream, substreamId, cb) {
  // check to make sure this socket has not already connected to the substream
  redisClient.hexists(REDIS_SOCKET_HEADER + socket.id, substreamId, function(err, exists) {
    if (err) {
      return cb(err);
    } else if (exists === '1') {
      // If it is, return false
      debug('Multiple substream connections',
          'Client already connected to substream ' + substreamId);
      return cb(null, false);
    } else {
      debug('substream check', 'substream Id: ' + substreamId + ' created on socket: ' + socket.id);
      // If not, then save it to redis
      redisClient.hset(REDIS_SOCKET_HEADER + socket.id, substreamId, true, function(err) {
        if (err) {
          return cb(err);
        }
        // then listen to the substream's onEnd event
        substream.on('end', function() {
          // When triggered, remove the key from the hash
          debug('substream end', 'substream Id: ' + substreamId + ' ended on socket: ' + socket.id);
          redisClient.hdel(REDIS_SOCKET_HEADER + socket.id, substreamId, function () {});
        });
        return cb(null, true);
      });
    }
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
module.exports.checkIfAlreadyConnected = checkIfAlreadyConnected;