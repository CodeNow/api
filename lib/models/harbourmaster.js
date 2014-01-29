var p = require('path');
var configs = require('configs');
var request = require('request');
var error = require('error');
function Harbourmaster (url) {
  this.url = url;
  this.request = request.defaults({
    pool: false
  });
}
Harbourmaster.prototype.post = function (path, opts, callback) {
  opts.url = this.url + path;
  this.request.post(opts, callback);
};
Harbourmaster.prototype.commitContainer = function (domain, container, token, cb) {
  if (container.toJSON) {
    container = container.toJSON();
  }
  var opts = {
    json: container,
    headers: { 'runnable-token': token }
  };
  var path = p.join('/containers/', container.servicesToken, '/commit');
  this.post(path, opts, domain.intercept(function (res, body) {
    if (res.statusCode !== 204) {
      cb(error(502, 'error commiting (code:'+res.statusCode+') - '+JSON.stringify(body)));
    }
    else {
      cb(null, res);
    }
  }));
};
Harbourmaster.prototype.createContainer = function (domain, container, cb) {
  if (container.toJSON) {
    container = container.toJSON();
  }
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
  var repo = 'beep';
  var subdomain;
  var opts = {
    json: {
      servicesToken: container.servicesToken,
      webToken: container.webToken,
      subdomain: subdomain,
      Env: env,
      Hostname: 'runnable',
      Image: configs.dockerRegistry + '/runnable/' + repo
    }
  };
  var path = p.join('/containers/');
  this.post(path, opts, domain.intercept(function (res, body) {
    if (res.statusCode !== 204) {
      cb(error(502, 'error creating (code:'+res.statusCode+') - '+JSON.stringify(body)));
    }
    else {
      cb(null, res);
    }
  }));
};
Harbourmaster.prototype.cleanup = function (whiteServicesTokens, cb) {
  this.post('/containers/cleanup', {
    json: whiteServicesTokens
  }, function (err, res) {
    if (err) {
      cb(err);
    } else if (res.statusCode !== 200) {
      cb(error(502, 'whitelist not accepted by harbourmaster'));
    } else {
      cb();
    }
  });
};
module.exports = new Harbourmaster(configs.harbourmaster);