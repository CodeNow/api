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
  var key = [containerPort, '.', instanceName, '.', ownerUsername, '.', process.env.DOMAIN];
  key = ['frontend:'].concat(key).join('').toLowerCase();
  this.key = key;
}

require('util').inherits(HipacheEntry, RedisList);