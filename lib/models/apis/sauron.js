/**
 * Sauron is used to alloc/dealloc internal ips for containers
 * @module lib/models/apis/sauron
 */
'use strict';

var Boom = require('dat-middleware').Boom;
var SauronClient = require('sauron-client');
var error = require('error');
var keypather = require('keypather')();
var path = require('path');
var pick = require('101/pick');
var url = require('url');

var Mavis = require('models/apis/mavis');
var Network = require('models/mongo/network');
var logger = require('middlewares/logger')('models:apis:sauron');

var log = logger.log;

module.exports = Sauron;

var errorIs = {
  containerNotRunning: function (err) {
    return /not running/.test(err.message);
  },
  containerDied: function (err) {
    return /died/.test(err.message);
  },
  containerNotMappedToIp: function (err) {
    return err.output.statusCode === 409 && /not mapped/.test(err.message);
  },
  ipNotFound: function (err) {
    return err.output.statusCode === 404 && /not have ip/.test(err.message);
  },
  ipMappedToDiff: function (err) {
    return err.output.statusCode === 409 && /not have ip/.test(err.message);
  }
};

/**
 * Operations alloc/dealloc internal ips for containers
 * @class
 * @param {String} host
 * @return null
 */
function Sauron (host) {
  var port = process.env.SAURON_PORT;
  this.client = new SauronClient(host, port);
  this.hostNotProvided = false;
}

/**
 * Create sauron instance with any docker host
 * @param  {Function} cb callback
 * @return null
 */
Sauron.createWithAnyHost = function (cb) {
  log.trace({tx: true}, 'createWithAnyHost');
  var mavis = new Mavis();
  mavis.findDockForNetwork(function (err, dock) {
    if (err) { return cb(err); }
    var host = url.parse(dock).hostname; // no port
    var sauron = new Sauron(host);
    sauron.hostNotProvided = true;
    cb(null, sauron);
  });
};

/**
 * delete host ip allocated to context version build
 * @param  {Function} cv context version
 * @param  {Function} cb callback
 */
Sauron.deleteHostFromContextVersion = function (cv, cb) {
  log.trace({tx: true, cv:cv}, 'deleteHostFromContextVersion');
  var networkIp = keypather.get(cv, 'build.network.networkIp');
  var hostIp = keypather.get(cv, 'build.network.hostIp');
  var dockerHost = keypather.get(cv, 'dockerHost');
  if (!networkIp || !hostIp || !dockerHost) {
    return cb(new Error('requires network and dockerHost'));
  }
  var sauron = new Sauron(dockerHost);
  sauron.deleteHost(networkIp, hostIp, cb);
};

// NETWORKS
/**
 * create a new network
 * @param  {Function} cb callback
 */
Sauron.prototype.createNetwork = function (cb) {
  log.trace({tx: true}, 'createNetwork');
  this.client.createNetwork(this.handleResErr(function (err, body) {
    if (err) { return cb(err); }
    cb(null, body.networkIp);
  }, 'Create network failed', url));
};
/**
 * delete an existing network
 * @param  {Function} cb callback
 */
Sauron.prototype.deleteNetwork = function (networkIp, cb) {
  log.trace({tx: true}, 'deleteNetwork');
  this.client.deleteNetwork(networkIp, this.handleResErr(cb, 'deleteNetwork', url));
};

// HOSTS
/**
 * Create a new weave host on the weave network
 * @param  {string}   networkIp weave network
 * @param  {Function} cb        callback
 */
Sauron.prototype.createHost = function (networkIp, cb) {
  log.trace({tx: true}, 'createHost');
  this.client.createHost(networkIp, this.handleResErr(function (err, body) {
    if (err) { return cb(err); }
    cb(err, body.hostIp);
  }, 'Create host failed', url));
};
/**
 * Completely delete weave host from weave network
 * @param  {string}   networkIp weave network
 * @param  {string}   hostIp    weave host for weave network
 * @param  {Function} cb        callback
 */
Sauron.prototype.deleteHost = function (networkIp, hostIp, cb) {
  log.trace({
    tx: true,
    networkIp: networkIp,
    hostIp: hostIp
  }, 'deleteHost');
  this.client.deleteHost(networkIp, hostIp, this.handleResErr(cb, 'deleteHost', url));
};

// CONTAINERS
/**
 * Get container host ip
 * @param  {Container} containerId docker container Id
 * @param  {Function}  cb          callback
 */
Sauron.prototype.getContainerIp = function (containerId, cb) {
  log.trace({
    tx: true,
    containerId: containerId
  }, 'getContainerIp');
  this.client.getContainerIp(containerId, this.handleResErr(function (err, info) {
    if (err) {
      if (errorIs.ipNotFound(err)) {
        cb(null, null);
      }
      else {
        cb(err);
      }
    }
    else {
      cb(null, info.ip);
    }
  }, 'Get container ip failed', url));
};
/**
 * Attach weave host to the docker container
 * @param  {string}   networkIp  weave networkIp
 * @param  {string}   hostIp      weave hostIp
 * @param  {string}   containerId docker container id
 * @param  {string}   [ignoreIpMappedToDiffErr] ignore mapped to different container error
 * @param  {Function} cb          callback
 */
Sauron.prototype.attachHostToContainer =
  function (networkIp, hostIp, containerId, ignoreIpMappedToDiffErr, cb) {
    log.trace({
      tx: true,
      networkIp: networkIp,
      hostIp: hostIp,
      containerId: containerId,
      ignoreIpMappedToDiffErr: ignoreIpMappedToDiffErr
    }, 'attachHostToContainer');
    if (typeof ignoreIpMappedToDiffErr === 'function') {
      cb = ignoreIpMappedToDiffErr;
      ignoreIpMappedToDiffErr = false;
    }
    if (this.hostNotProvided) {
      return cb(new Error('Host must be provided (container host) it cannot be random'));
    }
    this.client.attachHostToContainer(networkIp, hostIp, {
      containerId: containerId,
      force: true
    }, this.handleResErr(function (err) {
      if (err &&
          !errorIs.containerNotRunning(err) &&
          !errorIs.containerDied(err) &&
          (ignoreIpMappedToDiffErr ? !errorIs.ipMappedToDiff(err) : true)) {
        return cb(err);
      }
      cb();
    }, 'Host attach failed', url));
  };
/**
 * Detach weave  host to the docker container
 * @param  {string}   hostIp      weave hostIp
 * @param  {string}   containerId docker container id
 * @param  {Function} cb          callback
 */
Sauron.prototype.detachHostFromContainer = function (networkIp, hostIp, containerId, cb) {
  log.trace({
    tx: true,
    networkIp: networkIp,
    hostIp: hostIp,
    containerId: containerId
  }, 'detachHostFromContainer');
  if (this.hostNotProvided) {
    return cb(new Error('Host must be provided (container host) it cannot be random'));
  }
  this.client.detachHostFromContainer(networkIp, hostIp, {
    containerId: containerId,
    force: true
  }, this.handleResErr(function (err) {
    if (err &&
        !errorIs.containerNotRunning(err) &&
        !errorIs.containerDied(err) &&
        !errorIs.containerNotMappedToIp(err)) {
      return cb(err);
    }
    cb();
  }, 'Host detach failed', url));
};

Sauron.prototype.handleResErr = function (cb, message, url) {
  var self = this;
  return function (err, res) {
    if (err) {
      cb(self.unavailableErr(url, message, err));
    }
    else if (res.statusCode >= 300) {
      var statusCode = res.statusCode === 500 ? 502 : res.statusCode;
      message = res.body.message ? message+': '+res.body.message : message;
      cb(Boom.create(statusCode, message, {
        debug: {
          sauron: {
            uri: url,
            statusCode: res.statusCode,
            body: res.body
          }
        }
      }));
    }
    else {
      cb(err, res.body, res);
    }
  };
};

Sauron.prototype.unavailableErr = function (urlPath, message, err) {
  log.error({
    tx: true,
    urlPath: urlPath,
    message: message,
    err: err
  }, 'unavailableErr');
  urlPath = Array.isArray(urlPath) ?
    path.join.apply(path, ['/'].concat(urlPath)) :
    urlPath;
  var boomErr = Boom.create(504, message+': temporarily unavailable', {
    sauron: {
      uri: this.host+urlPath
    },
    err: err
  });
  return boomErr;
};

/**
 * Find or create a host ip (and network ip) for an instance
 * @param  {Instance} instance instance model for which to find or create a host for
 * @param  {Function} cb       callback
 * @return {object}   { networkIp:<networkIp>, hostIp:<hostIp> }
 */
// Fixme: this really belongs in the routes (controller) logic
// but this will work nicer once we integrate mongooseware, bc using
// another instance query method will overwrite the instance on the req.
// which would force use to do some shuffling, which is messy..
// See wip middleware version below.
Sauron.prototype.findOrCreateHostForInstance = function (instance, cb) {
  log.trace({
    tx: true,
    instance: instance
  }, 'findOrCreateHostForInstance');
  var self = this;
  var networkInfo = instance.network;
  if (networkInfo && networkInfo.networkIp && networkInfo.hostIp) {
    return cb(null, pick(networkInfo, ['networkIp', 'hostIp']));
  }
  self.createOrFindNetwork(instance.owner, function (err, networkIp) {
    if (err) { return cb(err); }
    self.createHost(networkIp, function (err, hostIp) {
      cb(err, {
        networkIp: networkIp,
        hostIp: hostIp
      });
    });
  });
};

/**
 * Find or create a host ip (and network ip) for an context
 * @param  {Instance} context context model for which to find or create a host for
 * @param  {Function} cb       callback
 * @return {object}   { networkIp:<networkIp>, hostIp:<hostIp> }
 */
Sauron.prototype.findOrCreateHostForContext = function (context, cb) {
  log.trace({
    tx: true,
    context: context
  }, 'findOrCreateHostForContext');
  var self = this;
  var owner = context.owner;
  self.createOrFindNetwork(owner, function (err, networkIp) {
    if (err) { return cb(err); }
    self.createHost(networkIp, function (err, hostIp) {
      cb(err, {
        networkIp: networkIp,
        hostIp: hostIp
      });
    });
  });
};

/**
 * Find or create a host ip (and network ip) for an owner
 * @param  {owner}   owner  owner for network
 * @param  {Function} cb    callback
 * @return {object}   { networkIp:<networkIp>, hostIp:<hostIp> }
 */
Sauron.prototype.createOrFindNetwork = function (owner, cb) {
  var self = this;
  Network.findNetworkForOwner(owner, function (err, networkIp) {
    if (err) { return cb(err); }
    if (networkIp) {
      return cb(null, networkIp);
    }
    self.createNetwork(function (err, networkIp) {
      if (err) { return cb(err); }
      Network.create({
        owner: owner,
        ip: networkIp
      }, function (err) {
        if (err) {
          if (error.isMongoAlreadyExistsError(err)) {
            self.deleteNetwork(networkIp, error.logIfErr);
            // try again, find will hit
            return self.createOrFindNetwork(owner, cb);
          }
          return cb(err); // other error
        }

        cb(null, networkIp);
      });
    });
  });
};
