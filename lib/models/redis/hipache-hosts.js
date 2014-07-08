'use strict';

var configs = require('configs');
var redis = require('models/redis');
var url = require('url');
var async = require('async');
var Boom = require('dat-middleware').Boom;
var RedisList = require('redis-types').List;

module.exports = HipacheHosts;

function HipacheHosts () {
  this.redis = redis;
}

HipacheHosts.prototype.createRouteForContainerPort = function (container, containerPort, cb) {
  var portSplit = containerPort.split('/'); // ex: "80/tcp"
  var containerPortNumber = portSplit[0];
  var key = ['frontend:',
    container._id, '-', containerPortNumber, '.', process.env.DOMAIN
  ].join('');
  var hipacheHost = new RedisList(key);
  var actualPort = container.ports[containerPort][0].HostPort;
  var backendUrl = url.format({
    protocol: 'http:',
    hostname: container.dockerHost,
    port: actualPort
  });
  async.series([
    hipacheHost.del.bind(hipacheHost),
    hipacheHost.rpush.bind(hipacheHost, backendUrl)
  ], cb);
};

// container is a instance.containers container
HipacheHosts.prototype.createRoutesForContainer = function (container, cb) {
  var self = this;
  if (!container.dockerHost || !container.dockerContainer) {
    cb(Boom.badRequest('Container is invalid'));
  }
  else {
    async.each(Object.keys(container.ports), function (containerPort, cb) {
      self.createRouteForContainerPort(container, containerPort, cb);
    }, cb);
  }
};

HipacheHosts.prototype.createRoutesForInstance = function (instance, cb) {
  if (!instance.containers || instance.containers.length === 0) {
    cb(Boom.badRequest('Instance does not have any containers'));
  }
  async.each(instance.containers,
    this.createRoutesForContainer.bind(this),
    cb);
};

// HipacheHosts.prototype.routeContainerToFrontdoor = function (container, dockIp, cb) {
//   var strData = JSON.stringify({
//     servicesToken: container.servicesToken,
//     startUrl: container.getStartUrl(),
//     host: dockIp,
//     servicesPort: null,
//     webPort: null
//   });
//   var serviceKey = ['frontend:', container.servicesToken, '.', configs.domain].join('');
//   var webKey = ['frontend:', container.webToken, '.', configs.domain].join('');

//   var frontdoorUrl = url.format(configs.frontdoor);
//   redis.multi()
//     .rpush(serviceKey, strData, frontdoorUrl)
//     .rpush(webKey, strData, frontdoorUrl)
//     .exec(cb);
// };

// HipacheHosts.prototype.addContainerPorts = function (container, cb) {
//   var strData = JSON.stringify({
//     servicesToken: container.servicesToken,
//     startUrl: container.getStartUrl(),
//     host: container.host,
//     servicesPort: container.servicesPort,
//     webPort: container.webPort
//   });
//   var serviceKey = ['frontend:', container.servicesToken, '.', configs.domain].join('');
//   var webKey = ['frontend:', container.webToken, '.', configs.domain].join('');

//   var frontdoorUrl = url.format(configs.frontdoor);
//   redis.multi()
//     .lset(serviceKey, 0, strData)
//     .lset(webKey, 0, strData)
//     .exec(cb);
// };

// HipacheHosts.prototype.removeContainerPorts = function (container, cb) {
//   var serviceKey = ['frontend:', container.servicesToken, '.', configs.domain].join('');
//   var webKey = ['frontend:', container.webToken, '.', configs.domain].join('');

//   redis.multi()
//     .del(serviceKey)
//     .del(webKey)
//     .exec(cb);
// };
