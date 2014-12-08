'use strict';

var RedisMutex = require('./mutex');

function UserStoppedContainer (containerId) {
  var key = process.env.REDIS_NAMESPACE + containerId + ':user-stopped-container';
  RedisMutex.call(this, key);
}

require('util').inherits(UserStoppedContainer, RedisMutex);

module.exports = UserStoppedContainer;