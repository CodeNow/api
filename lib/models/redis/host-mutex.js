'use strict';
var RedisMutex = require('./mutex');

function HostMutex (ownerUsername, instanceName) {
  var key = [
    process.env.REDIS_NAMESPACE,
    ownerUsername, '.', instanceName,
    ':lock'
  ].join('').toLowerCase();
  RedisMutex.call(this, key);
}

require('util').inherits(HostMutex, RedisMutex);

module.exports = HostMutex;
