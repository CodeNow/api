'use strict';

var mongoose = require('mongoose');
var redis = require('models/redis');
var Network = require('models/mongo/network');
var Instance = require('models/mongo/instance');
var createCount = require('callback-count');
var equals = require('101/equals');
var not = require('101/not');
var pluck = require('101/pluck');

if (!process.env.NODE_PATH) {
  throw new Error('NODE_PATH=./lib is required');
}
if (!process.env.MONGO) {
  throw new Error('MONGO is required');
}
if (!process.env.SCRIPT_ORG_ID) {
  throw new Error('SCRIPT_ORG_ID is required');
}
if (!process.env.ACTUALLY_RUN) {
  console.log('DRY RUN!');
}
mongoose.connect(process.env.MONGO);

/**
 * Main
 */
main();
function main () {
  var orgId = process.env.SCRIPT_ORG_ID;
  var count = createCount(2, handleIps);
  var activeIps, allocatedIps, orgNetworkIp;
  // parallel
  findActiveIpsForOrg(orgId, function (err, _activeIps) {
    activeIps = _activeIps;
    count.next(err);
  });
  findOrgNetworkIp(orgId, function (err, _orgNetworkIp) {
    if (err) { count.next(err); }
    orgNetworkIp = _orgNetworkIp;
    findAllocatedIpsForOrg(orgNetworkIp, function (err, _allocatedIps) {
      if (err) { count.next(err); }
      allocatedIps = _allocatedIps;
      count.next(err);
    });
  });
  function handleIps (err) {
    if (err) { throw err; }
    removeInactiveIps(orgNetworkIp, allocatedIps, activeIps, function (err) {
      if (err) { throw err; }
      console.log('SCRIPT COMPLETE, all allocated inactive ips removed');
      mongoose.disconnect();
    });
  }
}

/**
 * Utils
 */

/**
 * find network host ips that are in use by org instances (mongo)
 * @param  {Number}   orgId  org github id
 * @param  {Function} cb     callback
 */
function findActiveIpsForOrg (orgId, cb) {
  var query  = { 'owner.github': orgId };
  var fields = { 'network.hostIp': 1 };
  Instance.find(query, fields, function (err, instances) {
    if (err) { return cb(err); }
    cb(null, instances.map(pluck('network.hostIp')));
  });
}

/**
 * find org network ip by org
 * @param {Number}   orgId  org github id
 * @param {Function} cb     callback
 */
function findOrgNetworkIp (orgId, cb) {
  Network.findOne({ 'owner.github': orgId }, function (err, network) {
    if (err) { return cb(err); }
    if (!network) {
      err = new Error('network for org not found:' + orgId);
      return cb(err);
    }
    cb(null, network.ip);
  });
}

/**
 * find network host ips allocated by sauron (redis)
 * @param  {String}   orgNetworkIp    org network ip
 * @param  {Function} cb     callback
 */
function findAllocatedIpsForOrg (orgNetworkId, cb) {
  var networkHashKey = 'weave:network:' + orgNetworkId;
  redis.hkeys(networkHashKey, cb);
}

/**
 * remove inactive allocated ips (redis)
 * @param  {String}   orgNetworkIp    org network ip
 * @param  {Array}    allocatedIps array of allocated ips (from sauron, redis)
 * @param  {Array}    activeIps    array of active ips (instances, mongo)
 * @param  {Function} cb           callback
 */
function removeInactiveIps (orgNetworkIp, allocatedIps, activeIps, cb) {
  var inactiveIps = allocatedIps.filter(function (allocatedIp) {
    var notEquals = not(equals);
    return activeIps.every(notEquals(allocatedIp));
  });
  console.log('ALLOCATED IPS', allocatedIps);
  console.log('ACTIVE IPS', activeIps);
  var count = createCount(inactiveIps.length, cb);
  var networkHashKey = 'weave:network:' + orgNetworkIp;
  if (inactiveIps.length === 0) {
    return cb();
  }
  console.log('REMOVE IPS!!!', inactiveIps);
  inactiveIps.forEach(function (inactiveIp) {
    if (process.env.ACTUALLY_RUN) {
      redis.hdel(networkHashKey, inactiveIp, count.next);
    }
    else {
      count.next();
    }
  });
}