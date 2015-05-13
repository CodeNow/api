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
NaviEntry.setRedisClient(require('models/redis'));
var HostMutex = require('models/redis/host-mutex');
var userContentDomainRE = new RegExp('^.*\-.*\.' + process.env.USER_CONTENT_DOMAIN + '$');

module.exports = Hosts;

var dns = new Dns();

function Hosts () {}

/**
 * parse instance hostname into name
 * @param  {string}   hostname  hostname of an instance
 * @param  {Function} cb   callback(err, instanceName)
 */
Hosts.prototype.parseHostname = function (hostname, cb) {
  var self = this;
  if (!userContentDomainRE.test(hostname)) {
    return invalidHostname(hostname, 'incorrect user content domain', cb);
  }
  var naviEntry = NaviEntry.createFromHost(hostname);
  naviEntry.getInstanceName(function (err, instanceName) {
    if (err) { return cb(err); }
    if (!instanceName) {
      return cb(Boom.notFound('hostname not found'));
    }
    self.parseUsernameFromHostname(hostname, instanceName, function (err, username) {
      cb(err, {
        username: username,
        instanceName: instanceName
      });
    });
  });
};

/**
 * parse instance hostname into username
 * @param  {string}   hostname  hostname of an instance
 * @param  {string}   name instanceName of the instance
 * @param  {Function} cb   callback(err, username)
 */
Hosts.prototype.parseUsernameFromHostname = function (hostname, instanceName, cb) {
  parseSubdomainFromHostname(hostname, function (err, subdomain) {
    if (err) { return cb(err); }
    // FIXME: use default branch is possible
    // matches urls with 0 or more `-` in front of instance name.
    // example: matchs shown with (). instanceName = test
    // (debug-test)-staging-user.runnableapp.com
    // (test-)staging-user.runnableapp.com
    // (debug-cat-yoda-test-)staging-user.runnableapp.com
    var regex = new RegExp('^(.+-)?'+instanceName+'-', 'i');
    if (!regex.test(subdomain)) {
      return invalidHostname(hostname, 'invalid subdomain', cb);
    }
    var username = subdomain.replace(regex, ''); // name-orgname split
    if (username.length === 0) {
      return invalidHostname(hostname, 'invalid username', cb);
    }
    var stagingElastic = new RegExp('^staging-', 'i');
    if (stagingElastic.test(username)) {
      username = username.replace(stagingElastic, ''); // replace 'staging-'
    }
    cb(null, username);
  });
};
function parseSubdomainFromHostname (hostname, cb) {
  var split = hostname.split('.'); // hostname dot split (subdomains)
  if (split.length !== 3) {
    return invalidHostname(hostname, 'invalid hostname', cb);
  }
  var subdomain = split[0];
  cb(null, subdomain);
}
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
    var branch = keypather.get(instance, 'contextVersion.appCodeVersions[0].lowerBranch');
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
          exposedPort: containerPort,
          branch: branch,
          instanceName: instanceName,
          ownerUsername: ownerUsername,
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
    var branch = keypather.get(instance, 'contextVersion.appCodeVersions[0].lowerBranch');
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
          exposedPort: containerPort,
          branch: branch,
          instanceName: instanceName,
          ownerUsername: ownerUsername,
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
