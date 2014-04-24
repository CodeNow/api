var Harbourmaster = require('models/harbourmaster');
var utils = require('middleware/utils');
var configs = require('configs');
var docklet = require('middleware/docklet');
var docker  = require('middleware/docker');
var hipacheHosts  = require('middleware/hipacheHosts');
var series = require('middleware-flow').series;

module.exports = {
  createContainer: function (imageKey, containerKey) {
    var containers = require('middleware/containers');
    return series(
      docklet.create(),
      docklet.model.findDockWithImage(imageKey),
      docker.create('dockletResult'),
      docker.model.createContainer(imageKey, containerKey),
      hipacheHosts.create(),
      hipacheHosts.model.createHostForContainer(
        "headers['runnable-token']", 'container', 'dockletResult'),
      containers.model.set({
        containerId: 'dockerResult.Id',
        host: 'dockletResult'
      })
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
      containers.model.save()
    );
  },

  stopContainer: function (containerKey) {
    return series(
      docker.create('container.host'),
      docker.model.stopContainer('container.containerId')
    );
  },

  githubBuild: function () {

  },







  // createContainer: function (req, res, next) {
  //   var container = req.container;
  //   var env = [
  //     'RUNNABLE_USER_DIR=' + container.file_root,
  //     'RUNNABLE_SERVICE_CMDS=' + container.service_cmds,
  //     'RUNNABLE_START_CMD=' + container.start_cmd,
  //     'RUNNABLE_BUILD_CMD=' + container.build_cmd,
  //     'SERVICES_TOKEN=' + container.servicesToken,
  //     'APACHE_RUN_USER=www-data',
  //     'APACHE_RUN_GROUP=www-data',
  //     'APACHE_LOG_DIR=/var/log/apache2',
  //     'PATH=/dart-sdk/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin'
  //   ];
  //   var repo = getRepo(req.image);
  //   var subdomain; //missing
  //   Harbourmaster.createContainer(req.domain, {
  //     servicesToken: container.servicesToken,
  //     webToken: container.webToken,
  //     subdomain: subdomain,
  //     Env: env,
  //     Hostname: 'runnable',
  //     Image: '' + configs.dockerRegistry + '/runnable/' + repo,
  //   }, next);
  // },
  commitContainer: function (req, res, next) {
    Harbourmaster.commitContainer(req.domain,
      encodeIdsIn(req.container.toJSON()),
      req.headers['runnable-token'],
      next);
  }
};

function getRepo (image) {
  var repo;
  if (image.revisions && image.revisions.length) {
    var length = image.revisions.length;
    var revision = image.revisions[length - 1];
    repo = revision.repo ? revision.repo : revision._id.toString();
  } else {
    repo = image._id.toString();
  }
  return repo;
}

var encodeIdsIn = function (json) {
  json._id = utils.encodeId(json._id);
  if (json.parent != null) {
    json.parent = utils.encodeId(json.parent);
  }
  if (json.target != null) {
    json.target = utils.encodeId(json.target);
  }
  if (json.child != null) {
    json.child = utils.encodeId(json.child);
  }
  return json;
};
