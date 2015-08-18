/**
 * @module lib/models/redis/hosts
 */
'use strict';

var Boom = require('dat-middleware').Boom;
var createCount = require('callback-count');
var isFunction = require('101/is-function');
var keypather = require('keypather')();
var put = require('101/put');

var ContextVersion = require('models/mongo/context-version');
var NaviEntry = require('navi-entry');
var logger = require('middlewares/logger')(__filename);
var redisClient = require('models/redis');

NaviEntry.setRedisClient(redisClient);

var log = logger.log;

module.exports = Hosts;

function Hosts () {}

/**
 * parse instance hostname into name
 * @param  {string}   hostname  hostname of an instance
 * @param  {Function} cb   callback(err, instanceName)
 */
Hosts.prototype.parseHostname = function (hostname, cb) {
  log.info({
    tx: true,
    hostname: hostname
  }, 'Hosts.prototype.parseHostname');
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
 * upsert hosts (hipache) for   instance
 * @param  {String}     ownerUsername   instance owner's username
 * @param  {Instance}   instance        instance mongo model
 * @param  {String}     [instanceName]  instanceName (could be diff from current name - old or new)
 *                                      for which to upsert host entries default: instance.name
 * @param  {Container}  [container]     container, default: instance.container
 * @param  {Function}   cb              callback
 */
Hosts.prototype.upsertHostsForInstance =
  function (ownerUsername, instance, instanceName, container, cb) {
    var logData = {
      tx: true,
      ownerUsername: ownerUsername,
      instance: instance,
      instanceName: instanceName,
      container: container
    };
    log.info(logData, 'Hosts.prototype.upsertHostsForInstance');
    var args = formatArgsForHosts.apply(null, arguments);
    ownerUsername = args.ownerUsername;
    instance = args.instance;
    instanceName = args.instanceName.toLowerCase();
    container = args.container;
    var appCodeVersions = keypather.get(instance, 'contextVersion.appCodeVersions');
    var branch = keypather.get(ContextVersion.getMainAppCodeVersion(appCodeVersions),
      'lowerBranch');
    cb = args.cb;
    if (!container || !container.ports || Object.keys(container.ports).length === 0) {
      cb();
    }
    else {
      var count = createCount(Object.keys(container.ports).length, cb);
      // upsert hipache entries for each port
      Object.keys(container.ports).forEach(function (containerPort) {
        log.trace({
          tx: true,
          branch: branch,
          instanceName: instanceName,
          USER_CONTENT_DOMAIN: process.env.USER_CONTENT_DOMAIN
        }, 'Hosts.prototype.upsertHostsForInstance forEach');
        new NaviEntry({
          shortHash: instance.shortHash,
          exposedPort: containerPort,
          branch: branch,
          instanceName: instanceName,
          ownerUsername: ownerUsername,
          ownerGithub: instance.owner.github,
          userContentDomain: process.env.USER_CONTENT_DOMAIN,
          masterPod: instance.masterPod
        }).setBackend(process.env.NAVI_HOST, function (err) {
          if (err) {
            log.error(put({
              err: err
            }, logData), 'Hosts.prototype.upsertHostsForInstance error');
          }
          else {
            log.trace(logData, 'Hosts.prototype.upsertHostsForInstance success');
          }
          count.next();
        });
      });
    }
  };

/**
 * upsert hosts (hipache) for   instance
 * @param  {String}     ownerUsername   instance owner's username
 * @param  {Instance}   instance        instance mongo model
 * @param  {String}     [instanceName]  instanceName (could be diff from current name - old or new)
 *                                      for which to delete host entries default: instance.name
 * @param  {Container}  [container]     container, default: instance.container
 * @param  {Function}   cb              callback
 */
Hosts.prototype.removeHostsForInstance =
  function (ownerUsername, instance, instanceName, container, cb) {
    log.info({
      tx: true
    }, 'Hosts.prototype.removeHostsForInstance');
    var args = formatArgsForHosts.apply(null, arguments);
    ownerUsername = args.ownerUsername;
    instance = args.instance;
    instanceName = args.instanceName.toLowerCase();
    container = args.container;
    var appCodeVersions = keypather.get(instance, 'contextVersion.appCodeVersions');
    var branch = keypather.get(ContextVersion.getMainAppCodeVersion(appCodeVersions),
      'lowerBranch');
    cb = args.cb;
    if (!container || !container.ports || Object.keys(container.ports).length === 0) {
      cb();
    }
    else {
      var count = createCount(Object.keys(container.ports).length, cb);
      // delete hipache entries for each port
      Object.keys(container.ports).forEach(function (containerPort) {
        log.trace({
          tx: true,
          branch: branch,
          instanceName: instanceName,
          USER_CONTENT_DOMAIN: process.env.USER_CONTENT_DOMAIN
        }, 'removing entry');
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
