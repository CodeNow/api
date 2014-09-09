'use strict';

var redis = require('models/redis');
var url = require('url');
var async = require('async');
var Boom = require('dat-middleware').Boom;
var RedisList = require('redis-types').List;

module.exports = HipacheHosts;

function HipacheHosts () {
  this.redis = redis;
}

HipacheHosts.prototype.createRouteForContainerPort =
  function (instance, container, containerPort, cb) {
    var portSplit = containerPort.split('/'); // ex: "80/tcp"
    var containerPortNumber = portSplit[0];
    var key = ['frontend:',
      instance.shortHash, '-', containerPortNumber, '.', process.env.DOMAIN
    ].join('').toLowerCase();
    var hipacheHost = new RedisList(key);
    hipacheHost.redis = redis;
    var actualPort = container.ports[containerPort][0].HostPort;
    var parsedDockerHost = url.parse(container.dockerHost);
    var backendUrl = url.format({
      protocol: 'http:',
      slashes: true,
      hostname: parsedDockerHost.hostname,
      port: actualPort
    });
    // special case port 80 since it will not go though port master
    if (~containerPortNumber.indexOf('80')) {
      var oldCb = cb;
      cb = function (err) {
        if (err) { oldCb(err); }
        var key80 = ['frontend:', instance.shortHash, '.', process.env.DOMAIN]
          .join('')
          .toLowerCase();
        var hipacheHost80 = new RedisList(key80);
        async.series([
          hipacheHost80.del.bind(hipacheHost80),
          hipacheHost80.rpush.bind(hipacheHost80, instance.name, backendUrl)
        ], oldCb);
      };
    }

    async.series([
      hipacheHost.del.bind(hipacheHost),
      hipacheHost.rpush.bind(hipacheHost, instance.name, backendUrl)
    ], cb);
  };

// container is a instance.containers container
HipacheHosts.prototype.createRoutesForContainer = function (instance, container, cb) {
  var self = this;
  if (!container.dockerHost || !container.dockerContainer) {
    cb(Boom.badRequest('Container is invalid'));
  }
  else if (container.ports) {
    async.each(Object.keys(container.ports), function (containerPort, cb) {
      self.createRouteForContainerPort(instance, container, containerPort, cb);
    }, cb);
  } else {
    cb();
  }
};

HipacheHosts.prototype.createRoutesForInstance = function (instance, cb) {
  if (!instance.containers || instance.containers.length === 0) {
    cb(Boom.badRequest('Instance does not have any containers'));
  }
  async.each(instance.containers,
    this.createRoutesForContainer.bind(this, instance),
    cb);
};

HipacheHosts.prototype.removeRouteForContainerPort =
  function (instance, container, containerPort, cb) {
    var portSplit = containerPort.split('/'); // ex: "80/tcp"
    var containerPortNumber = portSplit[0];
    var key = ['frontend:',
      instance.shortHash, '-', containerPortNumber, '.', process.env.DOMAIN
    ].join('').toLowerCase();
    var hipacheHost = new RedisList(key);

    // special case port 80 since it will not go though port master
    if (~containerPortNumber.indexOf('80')) {
      var oldCb = cb;
      cb = function (err) {
        if (err) { oldCb(err); }
        var key80 = ['frontend:', instance.shortHash, '.', process.env.DOMAIN]
          .join('')
          .toLowerCase();
        var hipacheHost80 = new RedisList(key80);
        hipacheHost80.del(oldCb);
      };
    }

    hipacheHost.redis = redis;
    hipacheHost.del(cb);
  };

HipacheHosts.prototype.removeRoutesForContainer = function (instance, container, cb) {
  var self = this;
  if (!container.dockerHost || !container.dockerContainer) {
    cb(Boom.badRequest('Container is invalid'));
  }
  else if (container.ports) {
    async.each(Object.keys(container.ports), function (containerPort, cb) {
      self.removeRouteForContainerPort(instance, container, containerPort, cb);
    }, cb);
  } else {
    cb();
  }
};

HipacheHosts.prototype.removeRoutesForInstance = function (instance, cb) {
  async.each(instance.containers,
    this.removeRoutesForContainer.bind(this, instance),
    cb);
};
