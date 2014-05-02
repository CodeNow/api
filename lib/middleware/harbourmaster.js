var Harbourmaster = require('models/harbourmaster');
var utils = require('middleware/utils');
var configs = require('configs');
var docklet = require('middleware/docklet');
var docker  = require('middleware/docker');
var events  = require('middleware/events');
var hipacheHosts  = require('middleware/hipacheHosts');
var flow = require('middleware-flow');
var series = flow.series;
var mwIf = flow.mwIf.bind(flow);
var syncIf = flow.syncIf.bind(flow);
var pluck = require('101/pluck');
var keypather = require('keypather')();
var redis = require('models/sharedRedis');

var harbourmaster = module.exports = {
  createContainer: function (imageKey, containerKey) {
    var containers = require('middleware/containers');
    return series(
      docklet.create(),
      docklet.model.findDockWithImage(imageKey),
      docker.create('dockletResult'),
      docker.model.createContainer(imageKey, containerKey),
      hipacheHosts.create(),
      hipacheHosts.model.routeContainerToFrontdoor(
        "headers['runnable-token']", 'container', 'dockletResult'),
      containers.model.set({
        containerId: 'dockerResult.id',
        host: 'dockletResult'
      }) // save occurs later
    );
  },

  startContainer: function (containerKey) {
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
        "headers['runnable-token']", 'container'),
      containers.model.save()
    );
  },

  stopContainer: function (containerKey) {
    return series(
      docker.create('container.host'),
      docker.model.stopContainer('container.containerId')
    );
  },

  commitContainer: function (containerKey) {
    var containers = require('middleware/containers');
    var images = require('middleware/images');
    var committingNew = function (req) {
      return req.body.status === 'Committing new';
    };
    return mwIf(series(
      containers.model.setAndSave({ status: 'Stopping Virtual Machine' }),
      events.containerStatusEvent('container'),
      hipacheHosts.create(),
      hipacheHosts.model.removeContainerPorts('container'),
      harbourmaster.stopContainer(containerKey),
      containers.model.setAndSave({ status: 'Saving Changes' }),
      events.containerStatusEvent('container'),
      docker.create('container.host'),
      docker.model.commitContainer('container'),
      containers.model.setAndSave({ status: 'Optimizing' }),
      events.containerStatusEvent('container'),
      // TODO: remove "Optimizing" event from frontend. (this used to be flatten)
      containers.model.setAndSave({ status: 'Distributing Runnable' }),
      events.containerStatusEvent('container'),
      syncIf(committingNew)
        .then( // publish new
          images.createFromContainer('container'),
          utils.code(200) // override 201
        )
        .else( // publish back
          images.find('container.parent'),
          images.checkFound,
          images.updateImageFromContainer('image', 'container')
        ),
      containers.model.setAndSave({ status: 'Finished' }),
      events.containerStatusEvent('container')
    )).else(
      containers.model.setAndSave({
        error: 'lastError'
      }),
      harbourmaster.startContainer(containerKey), // restart container, commit failed
      nextLastError
    );
  },

  cleanupContainers: function (containersKey) {
    return function (req, res, next) {
      var containers = keypather.get(req, containersKey);
      var containerIds = containers.map(pluck('containerId'));
      redis.publish('dockletPrune', JSON.stringify(containerIds));
      next();
    };
  }
};


function nextLastError (req, res, next) {
  next(req.lastError);
}
