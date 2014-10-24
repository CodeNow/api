'use strict';

var RedisList = require('redis-types').List;

module.exports = HipacheEntry;

/**
 * Create hipache host (redis list)
 * @param {String}     containerPort  container.ports hash key - ex: "80/tcp"
 * @param  {Instance}  instance
 * @param  {String}    ownerUsername instance owner's username
 * @return {RedisList} hipache host redis list
 */
function HipacheEntry (containerPort, instance, ownerUsername) {
  // 80 is a special case since it will not go though port master
  containerPort = containerPort.split('/')[0];
  var key = containerPort === '80' ?
    [instance.name, '.', ownerUsername, '.', process.env.DOMAIN] :
    [containerPort, '.', instance.name, '.', ownerUsername, '.', process.env.DOMAIN];
  key = ['frontend:'].concat(key).join('').toLowerCase();
  this.key = key;
}

require('util').inherits(HipacheEntry, RedisList);