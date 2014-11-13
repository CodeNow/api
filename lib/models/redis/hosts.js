'use strict';

var url = require('url');
var async = require('async');
var isFunction = require('101/is-function');
var Boom = require('dat-middleware').Boom;
var HipacheEntry = require('./hipache-entry');
var Dns = require('../apis/dns.js');
var dns = new Dns();
var createCount = require('callback-count');
var RedisMutex = require('models/redis/mutex');

module.exports = Hosts;

function Hosts () {}

/**
 * upsert hosts (hipache and dns) for   instance
 * @param  {String}     ownerUsername   instance owner's username
 * @param  {Instance}   instance        instance mongo model
 * @param  {String}     [instanceName]  instanceName (could be diff from current name - old or new)
 *                                      for which you want to upsert host entries default: instance.name
 * @param  {Container}  [container]     container, default: instance.container
 * @param  {Function}   cb              callback
 */
Hosts.prototype.upsertHostsForInstance =
  function (ownerUsername, instance, instanceName, container, cb) {
    if (isFunction(instanceName)) {
      cb = instanceName;
      instanceName = instance.name;
      container = instance.container;
    }
    if (isFunction(container)) {
      cb = container;
      container = instance.container;
    }
    var hosts = this;
    container = container || instance.container;
    if (!container || !container.dockerContainer || !container.ports) {
      cb();
    }
    else {
      var count = createCount(cb);
      // put internal dns entry
      dns.putEntryForInstance(
        instanceName, ownerUsername, instance.network.hostIp, count.inc().next);
      // upsert hipache entries for each port
      Object.keys(container.ports).forEach(function (containerPort) {
        hosts.upsertHostForContainerPort(
          containerPort, ownerUsername, instance, instanceName, count.inc().next);
      });
    }
  };

/**
 * upsert hosts (hipache and dns) for   instance
 * @param  {String}     ownerUsername   instance owner's username
 * @param  {Instance}   instance        instance mongo model
 * @param  {String}     [instanceName]  instanceName (could be diff from current name - old or new)
 *                                      for which you want to delete host entries default: instance.name
 * @param  {Container}  [container]     container, default: instance.container
 * @param  {Function}   cb              callback
 */
Hosts.prototype.removeHostsForInstance =
  function (ownerUsername, instance, instanceName, container, cb) {
    if (isFunction(instanceName)) {
      cb = instanceName;
      instanceName = instance.name;
      container = instance.container;
    }
    if (isFunction(container)) {
      cb = container;
      container = instance.container;
    }
    var hosts = this;
    container = container || instance.container;
    if (!container || !container.dockerContainer || !container.ports) {
      cb();
    }
    else {
      var count = createCount(cb);
      // delete internal dns entry
      dns.deleteEntryForInstance(
        instanceName, ownerUsername, instance.network.hostIp, count.inc().next);
      // delete hipache entries for each port
      Object.keys(container.ports).forEach(function (containerPort) {
        hosts.removeHostForContainerPort(
          containerPort, ownerUsername, instance, instanceName, count.inc().next);
      });
    }
  };

/**
 * create host for container port
 * @param {String}    containerPort   container.ports hash key - ex: "80/tcp"
 * @param {String}    ownerUsername   instance owner's username
 * @param {Instance}  instance        container's instance mongo model
 * @param {String}    instanceName    instanceName (could be diff from current name - old or new)
 *                                    for which you want to delete host entries
 * @param {Function}  callback
 */
Hosts.prototype.upsertHostForContainerPort =
  function (containerPort, ownerUsername, instance, instanceName, cb) {
    var hipacheHost = new HipacheEntry(containerPort, instanceName, ownerUsername);
    var container  = instance.container;
    var actualPort = container.ports[containerPort][0].HostPort;
    var parsedDockerHost = url.parse(container.dockerHost);
    var backendUrl = url.format({
      protocol: 'http:',
      slashes: true,
      hostname: parsedDockerHost.hostname,
      port: actualPort
    });
    async.series([
      hipacheHost.del.bind(hipacheHost),
      hipacheHost.rpush.bind(hipacheHost, instanceName, backendUrl)
    ], cb);
  };

/**
 * remove hipache routes for container port
 * @param {String}    containerPort   container.ports hash key - ex: "80/tcp"
 * @param {String}    ownerUsername   instance owner's username
 * @param {Instance}  instance        container's instance mongo model
 * @param {String}    instanceName    instanceName (could be diff from current name - old or new)
 *                                    for which you want to delete host entries
 * @param {Function}  callback
 */
Hosts.prototype.removeHostForContainerPort =
  function (containerPort, ownerUsername, instance, instanceName, cb) {
    var hipacheHost = new HipacheEntry(containerPort, instanceName, ownerUsername);
    hipacheHost.del(cb);
  };

/**
 * attain host lock for url composed of username and instanceName
 * @param  {String}   ownerUsername instance owner's username
 * @param  {String}   instanceName  instance name
 * @param  {Function} cb            callback
 */
Hosts.prototype.acquireHostLock = function (ownerUsername, instanceName, cb) {
  var hosts = this;
  var key = [ownerUsername, '.', instanceName].join();
  var mutex = new RedisMutex(key);
  mutex.lock(function (err, success) {
    if (err) {
      cb(err);
    }
    else if (!success) {
      cb(
        Boom.conflict('Instance\'s host entries are currently being updated, '+
          'try again after a few seconds.'));
    }
    else {
      cb(err, hosts); // must callback hosts or will mess up middleware model
    }
  });
};

/**
 * release host lock for url composed of username and instanceName
 * @param  {String}   ownerUsername instance owner's username
 * @param  {String}   instanceName  instance name
 * @param  {Function} cb            callback
 */
Hosts.prototype.releaseHostLock = function (ownerUsername, instanceName, cb) {
  var hosts = this;
  var key = [ownerUsername, '.', instanceName].join();
  var mutex = new RedisMutex(key);
  mutex.unlock(function (err) {
    cb(err, hosts); // must callback hosts or will mess up middleware model
  });
};

/**
 * read routes for container - used in tests
 * @param  {String}    ownerUsername instance owner username
 * @param  {Instance}  instanceName  name of instance
 * @param  {Container} container     container (json or mongo, must have inspect property!)
 * @param  {Function}  cb            callback
 */
Hosts.prototype.readHipacheEntriesForContainer = function (ownerUsername, instanceName, container, cb) {
  if (!container || !container.dockerContainer || !container.ports) {
    return cb();
  }
  var hipacheHosts = Object.keys(container.ports)
    .map(function (port) {
      port = port.split('/').shift();
      return new HipacheEntry(port, instanceName, ownerUsername);
    });
  async.reduce(hipacheHosts, {}, function (redisData, hipacheHost, cb) {
    hipacheHost.lrange(0, -1, function (err, backends) {
      redisData[hipacheHost.key] = backends;
      cb(err, redisData);
    });
  }, cb);
};