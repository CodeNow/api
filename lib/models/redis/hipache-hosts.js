'use strict';

var url = require('url');
var async = require('async');
var Boom = require('dat-middleware').Boom;
var HipacheEntry = require('./hipache-entry');

module.exports = HipacheHosts;

function HipacheHosts () {}

/**
 * create hipache routes for container port
 * @param {String}    ownerUsername  instance owner's username
 * @param {Instance}  instance       container's instance mongo model
 * @param {Container} container      container for which we are creating the hipache route
 * @param {String}    containerPort  container.ports hash key - ex: "80/tcp"
 * @param {Function}  callback
 */
HipacheHosts.prototype.createRouteForContainerPort =
  function (ownerUsername, instance, container, containerPort, cb) {
    var hipacheHost = new HipacheEntry(containerPort, instance, ownerUsername);
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
      hipacheHost.rpush.bind(hipacheHost, instance.name, backendUrl)
    ], cb);
  };

/**
 * create hipache routes for all of a container's ports
 * @param {String}    ownerUsername  instance owner's username
 * @param {Instance}  instance       container's instance mongo model
 * @param {Container} container      container for which we are creating the hipache route
 * @param {Function}  callback
 */
HipacheHosts.prototype.createRoutesForContainer =
  function (ownerUsername, instance, container, cb) {
    var self = this;
    if (!container.dockerHost) {
      cb(Boom.badRequest('Container is missing dockerHost', { debug: container.toJSON() }));
    }
    else if (!container.dockerContainer) {
      cb(Boom.badRequest('Container is missing dockerContainer', { debug: container.toJSON() }));
    }
    else if (container.ports) {
      async.each(Object.keys(container.ports), function (containerPort, cb) {
        self.createRouteForContainerPort(ownerUsername, instance, container, containerPort, cb);
      }, cb);
    } else {
      cb();
    }
  };

/**
 * create hipache routes for an instance (all container's ports)
 * @param {String}    ownerUsername  instance owner's username
 * @param {Instance}  instance       container's instance mongo model
 * @param {Function}  callback
 */
HipacheHosts.prototype.createRoutesForInstance = function (ownerUsername, instance, cb) {
  if (!instance.container) {
    return cb(Boom.badRequest('Instance does not have a container'));
  }
  this.createRoutesForContainer(ownerUsername, instance, instance.container, cb);
};

/**
 * read routes for container
 * @param  {String}    ownerUsername instance owner username
 * @param  {Instance}  instance      instance (json or mongo model)
 * @param  {Container} container     container (json or mongo, must have inspect property!)
 * @param  {Function}  cb            callback
 */
HipacheHosts.prototype.readRoutesForContainer = function (ownerUsername, instance, container, cb) {
  var hipacheHosts = Object.keys(container.ports)
    .map(function (port) {
      port = port.split('/').shift();
      return new HipacheEntry(port, instance, ownerUsername);
    });
  async.reduce(hipacheHosts, {}, function (redisData, hipacheHost, cb) {
    hipacheHost.lrange(0, -1, function (err, backends) {
      redisData[hipacheHost.key] = backends;
      cb(err, redisData);
    });
  }, cb);
};

/**
 * remove hipache routes for container port
 * @param {String}    ownerUsername  instance owner's username
 * @param {Instance}  instance       container's instance mongo model
 * @param {Container} container      container for which we are creating the hipache route
 * @param {String}    containerPort  container.ports hash key - ex: "80/tcp"
 * @param {Function}  callback
 */
HipacheHosts.prototype.removeRouteForContainerPort =
  function (ownerUsername, instance, container, containerPort, cb) {
    var hipacheHost = new HipacheEntry(containerPort, instance, ownerUsername);
    hipacheHost.del(cb);
  };

/**
 * remove hipache routes for all container's ports
 * @param {String}    ownerUsername  instance owner's username
 * @param {Instance}  instance       container's instance mongo model
 * @param {Container} container      container for which we are creating the hipache route
 * @param {Function}  callback
 */
HipacheHosts.prototype.removeRoutesForContainer =
  function (ownerUsername, instance, container, cb) {
    var self = this;
    if (!container.dockerHost) {
      cb(Boom.badRequest('Container is missing dockerHost', { debug: container.toJSON() }));
    }
    else if (!container.dockerContainer) {
      cb(Boom.badRequest('Container is missing dockerContainer', { debug: container.toJSON() }));
    }
    else if (container.ports) {
      async.each(Object.keys(container.ports), function (containerPort, cb) {
        self.removeRouteForContainerPort(ownerUsername, instance, container, containerPort, cb);
      }, cb);
    } else {
      cb();
    }
  };

/**
 * remove hipache routes for an instance (all container's ports)
 * @param {String}    ownerUsername  instance owner's username
 * @param {Instance}  instance       container's instance mongo model
 * @param {Function}  callback
 */
HipacheHosts.prototype.removeRoutesForInstance = function (ownerUsername, instance, cb) {
  if (instance.container) {
    this.removeRoutesForContainer(ownerUsername, instance, instance.container, cb);
  }
  else {
    cb();
  }
};
