/**
 * @module lib/models/redis/hosts
 */
'use strict';

var Boom = require('dat-middleware').Boom;
var createCount = require('callback-count');
var debug = require('debug')('runnable-api:models:redis:hosts');
var isFunction = require('101/is-function');
var keypather = require('keypather')();

var Dns = require('models/apis/dns');
var NaviEntry = require('navi-entry');
var redisClient = require('models/redis');
NaviEntry.setRedisClient(redisClient);
var HostMutex = require('models/redis/host-mutex');
var ContextVersion = require('models/mongo/context-version');

module.exports = Hosts;

var dns = new Dns();

function Hosts () {}

/**
 * parse instance hostname into name
 * @param  {string}   hostname  hostname of an instance
 * @param  {Function} cb   callback(err, instanceName)
 */
Hosts.prototype.parseHostname = function (hostname, cb) {
  // validates at least 2 '-' + domain
  var userContentDomainRE = new RegExp('^.*\-.*\-.*\.' + // at least 2 -
    process.env.USER_CONTENT_DOMAIN + '$');
  if (!userContentDomainRE.test(hostname)) {
    return invalidHostname(hostname, 'incorrect user content domain', cb);
  }
  NaviEntry.createFromHostname(redisClient, hostname, function (err, naviEntry) {
    if (err) {
      return cb(Boom.notFound('entry not found for hostname: ' + hostname));
    }
    naviEntry.getInfo(function (err, info) {
      if (err) { return cb(err); }
      if (!info) {
        return cb(Boom.notFound('entry not found'));
      }
      cb(null, {
        username: info.ownerUsername,
        instanceName: info.instanceName
      });
    });
  });
};

function invalidHostname (hostname, msg, cb) {
  var errorMsg = 'Invalid hostname (ex: name-org.' + process.env.USER_CONTENT_DOMAIN + ')';
  var err = Boom.badRequest(errorMsg, {
    errorCode: 'INVALID_HOSTNAME', // this should not change!
    errorMsg: msg,
    errorHostname: hostname
  });
  cb(err);
}

/**
 * upsert hosts (hipache and dns) for   instance
 * @param  {String}     ownerUsername   instance owner's username
 * @param  {Instance}   instance        instance mongo model
 * @param  {String}     [instanceName]  instanceName (could be diff from current name - old or new)
 *                                      for which to upsert host entries default: instance.name
 * @param  {Container}  [container]     container, default: instance.container
 * @param  {Function}   cb              callback
 */
Hosts.prototype.upsertHostsForInstance =
  function (ownerUsername, instance, instanceName, container, cb) {
    var args = formatArgsForHosts.apply(null, arguments);
    ownerUsername = args.ownerUsername;
    instance = args.instance;
    instanceName = args.instanceName.toLowerCase();
    container = args.container;
    var appCodeVersion = keypather.get(instance, 'contextVersion.appCodeVersions');
    var branch = keypather.get(ContextVersion.getMainAppCodeVersion(appCodeVersion),
      'lowerBranch');
    cb = args.cb;
    if (!container || !container.ports) {
      cb();
    }
    else {
      var count = createCount(1 + Object.keys(container.ports).length, cb);
      // put internal dns entry
      dns.putEntryForInstance(instanceName, ownerUsername, instance, count.next);
      // upsert hipache entries for each port
      Object.keys(container.ports).forEach(function (containerPort) {
        debug('creating entry for', branch, instanceName, process.env.USER_CONTENT_DOMAIN);
        new NaviEntry({
          shortHash: instance.shortHash,
          exposedPort: containerPort,
          branch: branch,
          instanceName: instanceName,
          ownerUsername: ownerUsername,
          ownerGithub: instance.owner.github,
          userContentDomain: process.env.USER_CONTENT_DOMAIN,
          masterPod: instance.masterPod
        }).setBackend(process.env.NAVI_HOST, count.next);
      });
    }
  };

/**
 * upsert hosts (hipache and dns) for   instance
 * @param  {String}     ownerUsername   instance owner's username
 * @param  {Instance}   instance        instance mongo model
 * @param  {String}     [instanceName]  instanceName (could be diff from current name - old or new)
 *                                      for which to delete host entries default: instance.name
 * @param  {Container}  [container]     container, default: instance.container
 * @param  {Function}   cb              callback
 */
Hosts.prototype.removeHostsForInstance =
  function (ownerUsername, instance, instanceName, container, cb) {
    var args = formatArgsForHosts.apply(null, arguments);
    ownerUsername = args.ownerUsername;
    instance = args.instance;
    instanceName = args.instanceName.toLowerCase();
    container = args.container;
    var appCodeVersion = keypather.get(instance, 'contextVersion.appCodeVersions');
    var branch = keypather.get(ContextVersion.getMainAppCodeVersion(appCodeVersion),
      'lowerBranch');
    cb = args.cb;
    if (!container || !container.ports) {
      cb();
    }
    else {
      var count = createCount(1 + Object.keys(container.ports).length, cb);
      // delete internal dns entry
      dns.deleteEntryForInstance(instanceName, ownerUsername, instance, count.next);
      // delete hipache entries for each port
      Object.keys(container.ports).forEach(function (containerPort) {
        debug('removing entry for', branch, instanceName, process.env.USER_CONTENT_DOMAIN);
        new NaviEntry({
          shortHash: instance.shortHash,
          exposedPort: containerPort,
          branch: branch,
          instanceName: instanceName,
          ownerUsername: ownerUsername,
          ownerGithub: instance.owner.github,
          userContentDomain: process.env.USER_CONTENT_DOMAIN,
          masterPod: instance.masterPod
        }).del(count.next);
      });
    }
  };

/**
 * attain host lock for url composed of username and instanceName
 * @param  {String}   ownerUsername instance owner's username
 * @param  {String}   instanceName  instance name
 * @param  {Function} cb            callback
 */
Hosts.prototype.acquireHostLock = function (ownerUsername, instanceName, cb) {
  var hosts = this;
  var mutex = new HostMutex(ownerUsername, instanceName);
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
  var mutex = new HostMutex(ownerUsername, instanceName);
  mutex.unlock(function (err) {
    cb(err, hosts); // must callback hosts or will mess up middleware model
  });
};

function formatArgsForHosts (ownerUsername, instance, instanceName, container, cb) {
  if (isFunction(instanceName)) {
    cb = instanceName;
    instanceName = instance.name;
    container = instance.container;
  }
  if (isFunction(container)) {
    cb = container;
    container = instance.container;
  }
  container = container || instance.container;

  return {
    ownerUsername: ownerUsername,
    instance: instance,
    instanceName: instanceName,
    container: container,
    cb: cb
  };
}
