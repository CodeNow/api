'use strict';

/* Sauron is used to alloc/dealloc internal ips for containers */

var ApiClient = require('simple-api-client');
var util = require('util');
var Network = require('models/mongo/network');
var pick = require('101/pick');
var Boom = require('dat-middleware').Boom;
var path = require('path');
var error = require('error');
var url = require('url');
var debug = require('debug')('runnable-api:sauron:model');
var Mavis = require('models/apis/mavis');

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

module.exports = Sauron;

function Sauron (host) {
  debug('new Sauron', formatArgs(arguments));
  if (!host) {
    throw new Error('Sauron needs a host');
  }
  var port = process.env.SAURON_PORT;
  if (~host.indexOf(':')) {
    host = host.split(':').slice(0, -1).join(':'); // slice off port if it exists
  }
  this.host = host+':'+port;
  this.hostNotProvided = false;
  ApiClient.call(this, this.host);
}


util.inherits(Sauron, ApiClient);

/**
 * Create sauron instance with any docker host
 * @param  {Function} cb callback
 */
Sauron.createWithAnyHost = function (cb) {
  debug('createWithAnyHost', formatArgs(arguments));
  var mavis = new Mavis();
  mavis.findDockForNetwork(function (err, dock) {
    if (err) { return cb(err); }
    var host = url.parse(dock).hostname; // no port
    var sauron = new Sauron(host);
    sauron.hostNotProvided = true;
    cb(null, sauron);
  });
};

// NETWORKS
/**
 * create a new network
 * @param  {Function} cb callback
 */
Sauron.prototype.createNetwork = function (cb) {
  debug('createNetwork', formatArgs(arguments));
  var url = 'networks';
  this.post(url, this.handleResErr(function (err, body) {
    if (err) { return cb(err); }
    cb(null, body.networkIp);
  }, 'Create network failed', url));
};
/**
 * delete an existing network
 * @param  {Function} cb callback
 */
Sauron.prototype.deleteNetwork = function (networkIp, cb) {
  debug('deleteNetwork', formatArgs(arguments));
  var url = ['networks', networkIp];
  this.del(url, this.handleResErr(cb, 'deleteNetwork', url));
};

// HOSTS
/**
 * Create a new weave host on the weave network
 * @param  {string}   networkIp weave network
 * @param  {Function} cb        callback
 */
Sauron.prototype.createHost = function (networkIp, cb) {
  debug('createHost', formatArgs(arguments));
  var url = ['networks', networkIp, 'hosts'];
  this.post(url, this.handleResErr(function (err, body) {
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
  debug('deleteHost', formatArgs(arguments));
  var url = ['networks', networkIp, 'hosts', hostIp];
  this.del(url, this.handleResErr(cb, 'deleteHost', url));
};

// CONTAINERS
/**
 * Get container host ip
 * @param  {Container} containerId docker container Id
 * @param  {Function}  cb          callback
 */
Sauron.prototype.getContainerIp = function (containerId, cb) {
  debug('getContainerIp', formatArgs(arguments));
  var url = ['containers', containerId];
  this.get(url, this.handleResErr(function (err, info) {
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
    debug('attachHostToContainer', formatArgs(arguments));
    if (typeof ignoreIpMappedToDiffErr === 'function') {
      cb = ignoreIpMappedToDiffErr;
      ignoreIpMappedToDiffErr = false;
    }
    if (this.hostNotProvided) {
      return cb(new Error('Host must be provided (container host) it cannot be random'));
    }
    var url = ['networks', networkIp, 'hosts', hostIp, 'actions/attach'];
    this.put(url, {json:{ containerId: containerId }}, this.handleResErr(function (err) {
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
  debug('detachHostFromContainer', formatArgs(arguments));
  if (this.hostNotProvided) {
    return cb(new Error('Host must be provided (container host) it cannot be random'));
  }
  var url = ['networks', networkIp, 'hosts', hostIp, 'actions/detach'];
  this.put(url, {json:{ containerId: containerId }}, this.handleResErr(function (err) {
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
  debug('unavailableErr', formatArgs(arguments));
  urlPath = Array.isArray(urlPath) ?
    path.join.apply(path, ['/'].concat(urlPath)) :
    urlPath;
  console.error(urlPath, err);
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
 * @return {object}   { network:<networkIp>, host:<hostIp> }
 */
// Fixme: this really belongs in the routes (controller) logic
// but this will work nicer once we integrate mongooseware, bc using
// another instance query method will overwrite the instance on the req.
// which would force use to do some shuffling, which is messy..
// See wip middleware version below.
Sauron.prototype.findOrCreateHostForInstance = function (instance, cb) {
  debug('findOrCreateHostForInstance', formatArgs(arguments));
  var self = this;
  var networkInfo = instance.network;
  if (networkInfo && networkInfo.networkIp && networkInfo.hostIp) {
    cb(null, pick(networkInfo, ['networkIp', 'hostIp']));
  }
  else {
    createOrFindNetwork(function (err, networkIp) {
      if (err) { return cb(err); }
      self.createHost(networkIp, function (err, hostIp) {
        cb(err, {
          networkIp: networkIp,
          hostIp: hostIp
        });
      });
    });
  }
  function createOrFindNetwork (cb) {
    Network.findNetworkForOwner(instance.owner, function (err, networkIp) {
      if (err) {
        cb(err);
      } else if (!networkIp) {
        self.createNetwork(function (err, networkIp) {
          if (err) { return cb(err); }

          Network.create({
            owner: instance.owner,
            ip: networkIp
          }, function (err) {
            if (err) {
              if (error.isMongoAlreadyExistsError(err)) {
                self.deleteNetwork(networkIp, error.logIfErr);
                createOrFindNetwork(cb); // try again, find will hit
              }
              else {
                cb(err); // other error
              }
            }
            else {
              cb(null, networkIp);
            }
          });
        });
      } else {
        cb(null, networkIp);
      }
    });
  }
};


function formatArgs (args) {
  var isFunction = require('101/is-function');
  return Array.prototype.slice.call(args)
    .map(function (arg) {
      return isFunction(arg) ?
        '[ Function '+(arg.name || 'anonymous')+' ]' :
        (arg && arg._id || arg);
    });
}