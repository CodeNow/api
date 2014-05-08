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
    repo: configs.dockerRegistry+'/runnable/'+container._id // must be decoded - hex!!
  };
  var containerId = container.containerId.slice(0, 12);
  this.docker.getContainer(containerId)
    .commit(opts, cb);
};

Docker.prototype.pushRepoById = function (repoId, cb) {
  var repo = configs.dockerRegistry+'/runnable/'+repoId;
  var errored = false;
  this.docker.getImage(repo)
    .push({}, function (err, stream) {
      if (err) {
        cb(err);
      }
      else {
        stream.on('error', onError);
        stream.on('data', onData);
        stream.on('end', onEnd);
      }
      function onError (err) {
        errored = err;
        cb(err);
      }
      function onData (data) {
        if (errored) { return; }
        try {
          JSON.parse(data);
          if (data.error) {
            var errorDetail = data.errorDetail;
            onError(error(502, errorDetail.code+': '+errorDetail.message+' '+data.error));
          }
        }
        catch (err) {
          onError(err);
        }
      }
      function onEnd () {
        if (errored) { return; }
        cb();
      }
    });
};
