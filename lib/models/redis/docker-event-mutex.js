/**
 * @module lib/models/redis/docker-event-mutex
 */
'use strict';

var RedisMutex = require('./mutex');

module.exports = EventMutex;

/**
 * @class
 */
function EventMutex (eventId) {
  var key = process.env.DOCKER_EVENTS_NAMESPACE + eventId + ':lock';
  RedisMutex.call(this, key);
}

require('util').inherits(EventMutex, RedisMutex);
