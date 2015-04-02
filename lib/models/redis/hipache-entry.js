'use strict';

var RedisList = require('redis-types').List;
var Boom = require('dat-middleware').Boom;
var redisClient = require('models/redis/index'); // init redisClient for redis-types

module.exports = HipacheEntry;

/**
 * Create hipache host (redis list)
 * @param  {String}    key  redisKey for hipache entry
 * --OR--
 * @param  {String}    containerPort  container.ports hash key - ex: "80/tcp"
 * @param  {String}    instanceName   instance's name
 * @param  {String}    ownerUsername  instance owner's username
 * @return {RedisList} hipache host   redis list
 */
function HipacheEntry (containerPort, instanceName, ownerUsername) {
  var key;
  if (arguments.length === 1) {
    this.key = containerPort;
  }
  else {
    containerPort = containerPort.split('/')[0];
    // the new user domain is active. use the new domain scheme
    key = [
      containerPort, '.',
      instanceName, '-', ownerUsername, '.',
      process.env.USER_CONTENT_DOMAIN
    ];
    key = ['frontend:'].concat(key).join('').toLowerCase();
    this.key = key;
  }
}

require('util').inherits(HipacheEntry, RedisList);

/**
 * finds instance name for hostname
 * @param  {String}   hostname  instance hostname (no protocol, no port)
 * @param  {Function} cb        callback(err, instanceName)
 */
HipacheEntry.findInstanceNameForHostname = function (hostname, cb) {
  redisClient.keys('*.'+hostname, function (err, keys) {
    if (err) { return cb(err); }
    if (keys.length === 0) {
      return cb(Boom.notFound('hostname not found'));
    }
    var hipacheEntry = new HipacheEntry(keys[0]);
    hipacheEntry.lindex(0, cb);
  });
};
