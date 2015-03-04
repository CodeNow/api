'use strict';

var RedisList = require('redis-types').List;

module.exports = HipacheEntry;

/**
 * Create hipache host (redis list)
 * @param {String}     containerPort  container.ports hash key - ex: "80/tcp"
 * @param  {String}    instanceName   instance's name
 * @param  {String}    ownerUsername  instance owner's username
 * @return {RedisList} hipache host   redis list
 */
function HipacheEntry (containerPort, instanceName, ownerUsername) {
  // 80 is a special case since it will not go though port master
  containerPort = containerPort.split('/')[0];
  var key;
  // TODO(bryan): remove condition after migration is complete
  // if the user content domain is still the root domain
  if (process.env.DOMAIN === process.env.USER_CONTENT_DOMAIN) {
    // the migration hasn't happened yet, so don't use the new scheme
    key = [containerPort, '.', instanceName, '.', ownerUsername, '.', process.env.DOMAIN];
  } else {
    // the new user domain is active. use the new domain scheme
    key = [containerPort, '.',
           instanceName, '-', ownerUsername, '.',
           process.env.USER_CONTENT_DOMAIN];
  }
  key = ['frontend:'].concat(key).join('').toLowerCase();
  this.key = key;
}

require('util').inherits(HipacheEntry, RedisList);
