'use strict';
var RedisMutex = require('./mutex');

function HostMutex (ownerUsername, instanceName) {
  var key = [ownerUsername, '.', instanceName].join().toLowerCase();
  key = process.env.REDIS_NAMESPACE + key + ':lock';
  RedisMutex.call(this, key);
}

require('util').inherits(HostMutex, RedisMutex);

module.exports = HostMutex;