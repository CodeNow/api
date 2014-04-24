var configs = require('configs');
var keypather = require('keypather')();
var Dockerode = require('dockerode');
var containerOpts = configs.container;
var error = require('error');


module.exports = Docker;

function Docker (url) {
  this.docker = new Dockerode(url);
}

Docker.prototype.createContainer = function (image, container, cb) {
  var servicesToken = container.servicesToken;
  var webToken = container.webToken;

  var Volumes = {};
  Volumes[containerOpts.bindFolder] = {};
  var Env = container.getEnv().concat(stopUrlEnv);
  var opts = {
    Volumes  : Volumes,
    cmd      : containerOpts.cmd,
    Env      : Env,
    PortSpecs: containerOpts.portSpecs,
    Tty      : true,
    Hostname : 'runnable',
    Image    : configs.dockerRegistry + '/runnable/' + image.getRepo()
  };

  this.docker.createContainer(cb);
};

Docker.prototype.startContainer = function (containerId, cb) {
  var opts = {
    Binds: containerOpts.binds,
    PortBindings: containerOpts.portBindings
  };
  this.docker.getContainer(containerId).start(opts, cb);
};

Docker.prototype.stopContainer = function (containerId, cb) {
  var opts = {
    t: 1 // stop delay in seconds
  };
  this.docker.getContainer(containerId).stop(opts, cb);
};

Docker.prototype.inspectContainer = function (containerId, cb) {
  this.docker.getContainer(containerId).inspect(cb);
};