'use strict';
var RedisMutex = require('./mutex');

function EventMutex (eventId) {
  var key = process.env.DOCKER_EVENTS_NAMESPACE + eventId + ':lock';
  RedisMutex.call(this, key);
}

require('util').inherits(EventMutex, RedisMutex);

module.exports = EventMutex;