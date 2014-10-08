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
  function (ownerUsername, instance, container, containerPort, cb) {
    var portSplit = containerPort.split('/'); // ex: "80/tcp"
    var containerPortNumber = portSplit[0];
    var key = ['frontend:',
      containerPortNumber, '.', instance.name, '.', ownerUsername, '.', process.env.DOMAIN
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
        var key80 = ['frontend:', instance.name, '.', ownerUsername, '.', process.env.DOMAIN]
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

HipacheHosts.prototype.createRoutesForInstance = function (ownerUsername, instance, cb) {
  if (!instance.container) {
    return cb(Boom.badRequest('Instance does not have a container'));
  }
  this.createRoutesForContainer(ownerUsername, instance, instance.container, cb);
};

HipacheHosts.prototype.removeRouteForContainerPort =
  function (ownerUsername, instance, container, containerPort, cb) {
    var portSplit = containerPort.split('/'); // ex: "80/tcp"
    var containerPortNumber = portSplit[0];
    var key = ['frontend:',
      containerPortNumber, '.', instance.name, '.', ownerUsername, '.', process.env.DOMAIN
    ].join('').toLowerCase();
    var hipacheHost = new RedisList(key);

    // special case port 80 since it will not go though port master
    if (~containerPortNumber.indexOf('80')) {
      var oldCb = cb;
      cb = function (err) {
        if (err) { oldCb(err); }
        var key80 = ['frontend:', instance.name, '.', ownerUsername, '.', process.env.DOMAIN]
          .join('')
          .toLowerCase();
        var hipacheHost80 = new RedisList(key80);
        hipacheHost80.del(oldCb);
      };
    }

    hipacheHost.redis = redis;
    hipacheHost.del(cb);
  };

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

HipacheHosts.prototype.removeRoutesForInstance = function (ownerUsername, instance, cb) {
  if (instance.container) {
    this.removeRoutesForContainer(ownerUsername, instance, instance.container, cb);
  }
  else {
    cb();
  }
};
