var configs = require('configs');
var keypather = require('keypather')();
var Dockerode = require('dockerode');
var containerOpts = configs.container;
var error = require('error');
var url = require('url');
var dogerode = require('dogerode');

module.exports = Docker;

function Docker (host) {
  var parsed = ~host.indexOf('http:') ?
    url.parse(host) :
    url.parse('http://'+host);
  this.docker = dogerode(new Dockerode({
    host: parsed.protocol +'//'+ parsed.host,
    port: parsed.port || 4243
  }), {
    service: 'api'
  });
}

Docker.prototype.createContainer = function (image, container, cb) {
  var servicesToken = container.servicesToken;
  var webToken = container.webToken;

  var Volumes = {};
  Volumes[containerOpts.bindFolder] = {};
  var opts = {
    Volumes  : Volumes,
    Cmd      : containerOpts.cmd,
    Env      : container.getEnv(),
    PortSpecs: containerOpts.portSpecs,
    Tty      : true,
    Hostname : 'runnable',
    Image    : image.getRepo()
  };
  this.docker.createContainer(opts, cb);
};

Docker.prototype.startContainer = function (containerId, cb) {
  containerId = containerId.slice(0, 12);
  var opts = {
    Binds: containerOpts.binds,
    PortBindings: containerOpts.portBindings
  };
  this.docker.getContainer(containerId)
    .start(opts, cb);
};

Docker.prototype.stopContainer = function (containerId, cb) {
  containerId = containerId.slice(0, 12);
  var opts = {
    t: 1 // stop delay in seconds
  };
  this.docker.getContainer(containerId)
    .stop(opts, cb);
};

Docker.prototype.inspectContainer = function (containerId, cb) {
  containerId = containerId.slice(0, 12);
  this.docker.getContainer(containerId).inspect(cb);
};

Docker.prototype.commitContainer = function (container, cb) {
  var opts = {
    repo: 'registry.runnable.com/runnable/'+container._id // must be decoded - hex!!
  };
  var containerId = container.containerId.slice(0, 12);
  this.docker.getContainer(containerId)
    .commit(opts, cb);
};
