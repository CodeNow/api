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
  var opts = {
    json: container//,
    // headers: { 'runnable-token': token }
  };
  var path = p.join('/containers/', container.servicesToken);
  this.post(path, opts, domain.intercept(function (res, body) {
    if (res.statusCode !== 204) {
      console.log(path);
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