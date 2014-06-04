'use strict';

var docklet = require('middleware/docklet');
var docker  = require('middleware/docker');
var hipacheHosts  = require('middleware/hipacheHosts');
var flow = require('middleware-flow');
var series = flow.series;
var pluck = require('101/pluck');
var keypather = require('keypather')();
var redis = require('models/sharedRedis');
var exists = require('101/exists');

module.exports = {
  createContainer: function (imageKey, containerKey) {
    var containers = require('middleware/containers');
    return series(
      docklet.create(),
      docklet.model.findDockWithImage(imageKey, 'container.servicesToken'),
      docker.create('dockletResult'),
      docker.model.createContainer(imageKey, containerKey),
      hipacheHosts.create(),
      hipacheHosts.model.routeContainerToFrontdoor(
        'container', 'dockletResult'),
      containers.model.set({
        containerId: 'dockerResult.id',
        host: 'dockletResult'
      }) // save occurs later
    );
  },

  startContainer: function () {
    var containers = require('middleware/containers');
    return series(
      docker.create('container.host'),
      docker.model.startContainer('container.containerId'),
      docker.model.inspectContainer('container.containerId'),
      containers.model.set({
        servicesPort: "dockerResult.NetworkSettings.Ports['15000/tcp'][0].HostPort",
        webPort: "dockerResult.NetworkSettings.Ports['80/tcp'][0].HostPort"
      }),
      hipacheHosts.create(),
      hipacheHosts.model.addContainerPorts( // must be below container set.
        'container'),
      containers.model.save()
    );
  },

  stopContainer: function () {
    return series(
      docker.create('container.host'),
      docker.model.stopContainer('container.containerId')
    );
  },

  cleanupContainers: function (containersKey) {
    return function (req, res, next) {
      var containers = keypather.get(req, containersKey);
      var containerIds = containers
        .map(pluck('containerId'))
        .filter(exists)
        .map(invoke('slice', 0, 12)); // docklet expects container ids of length 12
      redis.publish('dockletPrune', JSON.stringify(containerIds));
      next();
    };
  }
};

function invoke (method /*, args */) {
  var args = Array.prototype.slice.call(arguments, 1);
  return function (item) {
    return item[method].apply(item, args);
  };
}
