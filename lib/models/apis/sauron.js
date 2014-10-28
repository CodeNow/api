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
var Mavis = require('models/apis/mavis');

module.exports = Sauron;

function Sauron (host) {
  if (!host) {
    throw new Error('Sauron needs a host');
  }
  var port = process.env.SAURON_PORT;
  this.host = host+':'+port;
  this.hostNotProvided = false;
  ApiClient.call(this, this.host);
}


util.inherits(Sauron, ApiClient);

/**
 * Create sauron instance with any docker host
 * @param  {Function} cb [description]
 * @return {[type]}      [description]
 */
Sauron.createWithAnyHost = function (cb) {
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
  var url = 'networks';
  this.post(url, this.handleResErr(function (err, body) {
    if (err) { return cb(err); }
    cb(null, body.networkIp);
  }));
};
/**
 * delete an existing network
 * @param  {Function} cb callback
 */
Sauron.prototype.deleteNetwork = function (networkIp, cb) {
  var url = ['networks', networkIp];
  this.del(url, this.handleResErr(cb));
};

// HOSTS
/**
 * Create a new weave host on the weave network
 * @param  {string}   networkIp weave network
 * @param  {Function} cb        callback
 */
Sauron.prototype.createHost = function (networkIp, cb) {
  var url = ['networks', networkIp, 'hosts'];
  this.post(url, this.handleResErr(function (err, body) {
    if (err) { return cb(err); }
    cb(err, body.hostIp);
  }));
};
/**
 * Completely delete weave host from weave network
 * @param  {string}   networkIp weave network
 * @param  {string}   hostIp    weave host for weave network
 * @param  {Function} cb        callback
 */
Sauron.prototype.deleteHost = function (networkIp, hostIp, cb) {
  var url = ['networks', networkIp, 'hosts', hostIp];
  this.del(url, this.handleResErr(cb));
};

// CONTAINERS
/**
 * Get container host ip
 * @param  {Container} containerId docker container Id
 * @param  {Function}  cb          callback
 */
Sauron.prototype.getContainerIp = function (containerId, cb) {
  var url = ['containers', containerId];
  this.get(url, this.handleResErr(function (err, info) {
    if (err) { return cb(err); }
    cb(null, info.ip);
  }));
};
/**
 * Attach weave host to the docker container
 * @param  {string}   hostIp      weave hostIp
 * @param  {string}   containerId docker container id
 * @param  {Function} cb          callback
 */
Sauron.prototype.attachHostToContainer = function (networkIp, hostIp, containerId, cb) {
  if (this.hostNotProvided) {
    return cb(new Error('Host must be provided (container host) it cannot be random'));
  }
  var url = ['networks', networkIp, 'hosts', hostIp, 'actions/attach'];
  this.put(url, {json:{ containerId: containerId }}, this.handleResErr(cb));
};
/**
 * Detach weave  host to the docker container
 * @param  {string}   hostIp      weave hostIp
 * @param  {string}   containerId docker container id
 * @param  {Function} cb          callback
 */
Sauron.prototype.detachHostFromContainer = function (networkIp, hostIp, containerId, cb) {
  if (this.hostNotProvided) {
    return cb(new Error('Host must be provided (container host) it cannot be random'));
  }
  var url = ['networks', networkIp, 'hosts', hostIp, 'actions/detach'];
  this.put(url, {json:{ containerId: containerId }}, this.handleResErr(cb));
};

Sauron.prototype.handleResErr = function (cb) {
   var self = this;
  return function (err, res) {
    if (err) {
      cb(self.unavailableErr(url, err));
    }
    else if (res.statusCode >= 300) {
      var request = res.request;
      cb(Boom.create(res.statusCode, res.body.message || 'Unknown', {
        debug: {
          sauron: {
            uri: url.format({
              hostname: request.host,
              port: request.port,
              pathname: request.path
            }),
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

Sauron.prototype.unavailableErr = function (urlPath, err) {
  urlPath = Array.isArray(urlPath) ?
    path.join.apply(path, ['/'].concat(urlPath)) :
    urlPath;

  var boomErr = Boom.create(504, 'Temporarily unavailable', {
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
