var Harbourmaster = require('models/harbourmaster');
var utils = require('middleware/utils');
var configs = require('configs');
module.exports = {
  createContainer: function (req, res, next) {
    var container = req.container;
    var env = [
      'RUNNABLE_USER_DIR=' + container.file_root,
      'RUNNABLE_SERVICE_CMDS=' + container.service_cmds,
      'RUNNABLE_START_CMD=' + container.start_cmd,
      'RUNNABLE_BUILD_CMD=' + container.build_cmd,
      'SERVICES_TOKEN=' + container.servicesToken,
      'APACHE_RUN_USER=www-data',
      'APACHE_RUN_GROUP=www-data',
      'APACHE_LOG_DIR=/var/log/apache2',
      'PATH=/dart-sdk/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin'
    ];
    var repo = getRepo(req.image);
    var subdomain; //missing
    Harbourmaster.createContainer(req.domain, {
      servicesToken: container.servicesToken,
      webToken: container.webToken,
      subdomain: subdomain,
      Env: env,
      Hostname: 'runnable',
      Image: '' + configs.dockerRegistry + '/runnable/' + repo,
    }, next);
  },
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
    repo = utils.encodeId(revision.repo ? revision.repo : revision._id.toString());
  } else {
    repo = utils.encodeId(image._id.toString());
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