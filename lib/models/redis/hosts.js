/**
 * @module lib/models/redis/hosts
 */
'use strict';

var Boom = require('dat-middleware').Boom;
var async = require('async');
var createCount = require('callback-count');
var isFunction = require('101/is-function');
var url = require('url');
var keypather = require('keypather')();

var Dns = require('models/apis/dns');
var HipacheEntry = require('models/redis/hipache-entry');
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
    return invalidHostname(cb);
  }
  HipacheEntry.findInstanceNameForHostname(hostname, function (err, instanceName) {
    if (err) { return cb(err); }
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
    var regex = new RegExp('^'+instanceName+'-', 'i');
    if (!regex.test(subdomain)) {
      return invalidHostname(cb);
    }
    var username = subdomain.replace(regex, ''); // name-orgname split
    if (username.length === 0) {
      return invalidHostname(cb);
    }
    cb(null, username);
  });
};
function parseSubdomainFromHostname (hostname, cb) {
  var split = hostname.split('.'); // hostname dot split (subdomains)
  if (split.length !== 3) {
    return invalidHostname(cb);
  }
  var subdomain = split[0];
  cb(null, subdomain);
}
function invalidHostname (cb) {
  var err = Boom.badRequest('Invalid hostname (ex: name-org.'+process.env.USER_CONTENT_DOMAIN+')', {
    errorCode: 'INVALID_HOSTNAME' // this should not change!
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
    cb = args.cb;
    var self = this;
    if (!container || !container.dockerContainer || !container.ports) {
      cb();
    }
    else {
      var count = createCount(1 + Object.keys(container.ports).length, cb);
      // put internal dns entry
      dns.putEntryForInstance(instanceName, ownerUsername, instance, count.next);
      // upsert hipache entries for each port
      Object.keys(container.ports).forEach(function (containerPort) {
        self.upsertHostForContainerPort(
          containerPort, ownerUsername, instance, instanceName, count.next);
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
    cb = args.cb;
    var self = this;
    if (!container || !container.dockerContainer || !container.ports) {
      cb();
    }
    else {
      var count = createCount(1 + Object.keys(container.ports).length, cb);
      // delete internal dns entry
      dns.deleteEntryForInstance(instanceName, ownerUsername, instance, count.next);
      // delete hipache entries for each port
      Object.keys(container.ports).forEach(function (containerPort) {
        self.removeHostForContainerPort(
          containerPort, ownerUsername, instance, instanceName, count.next);
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
// jshint maxparams:6
Hosts.prototype.upsertHostForContainerPort =
  function (containerPort, ownerUsername, instance, instanceName, cb) {
    var container = instance.container;
    var actualPort = container.ports[containerPort][0].HostPort;
    var parsedDockerHost = url.parse(container.dockerHost);
    var backendUrl = url.format({
      protocol: /^443\/.+/.test(containerPort) ? 'https:' : 'http:',
      slashes: true,
      hostname: parsedDockerHost.hostname,
      port: actualPort
    });
    if (instance.masterPod) {
      backendUrl = process.env.NAVI_HOST;
    }
    var entries = [];
    // TODO(bryan): remove; legacy url
    entries.push(new HipacheEntry(containerPort, instanceName, ownerUsername));
    if (instance.masterPod) {
      var branch = keypather.get(instance, 'contextVersion.appCodeVersions[0].lowerBranch');
      branch = branch || 'master';
      entries.push(
        new HipacheEntry(containerPort, branch + '-' + instanceName, 'staging-' + ownerUsername));
    }
    // elastic url if it is master pod, direct otherwise (will have branch in name)
    entries.push(new HipacheEntry(containerPort, instanceName, 'staging-' + ownerUsername));

    async.each(entries,
      function (entry, callback) {
        async.series([
          entry.del.bind(entry),
          entry.rpush.bind(entry, instanceName, backendUrl),
        ], callback);
      },
      cb);
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
    var entries = [];
    // TODO(bryan): remove; legacy
    entries.push(new HipacheEntry(containerPort, instanceName, ownerUsername));
    if (instance.isMasterPod) {
      var branch = keypather.get(instance, 'contextVersion.appCodeVersions[0].lowerBranch');
      branch = branch || 'master';
      // direct url
      entries.push(
        new HipacheEntry(containerPort, branch + '-' + instanceName, 'staging-' + ownerUsername));
    }
    // elastic url (if masterpod), direct url otherwise
    entries.push(new HipacheEntry(containerPort, instanceName, 'staging-' + ownerUsername));
    async.each(entries,
      function (entry, callback) {
        entry.del(callback);
      },
      cb);
  };
// jshint maxparams:5

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

/**
 * read routes for container - used in tests
 * @param  {String}    ownerUsername instance owner username
 * @param  {Instance}  instanceName  name of instance
 * @param  {Container} container     container (json or mongo, must have inspect property!)
 * @param  {Function}  cb            callback
 */
Hosts.prototype.readHipacheEntriesForContainer =
  function (ownerUsername, instanceName, container, cb) {
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
