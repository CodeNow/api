var Harbourmaster, configs, error, request;
configs = require('../configs');
request = require('request');
error = require('../error');
Harbourmaster = function (url) {
  this.url = url;
};
Harbourmaster.prototype.commitContainer = function (domain, encodedContainer, token, cb) {
  var container;
  container = encodedContainer;
  return request({
    pool: false,
    url: '' + this.url + '/containers/' + container.servicesToken + '/commit',
    method: 'POST',
    json: container,
    headers: { 'runnable-token': token }
  }, domain.intercept(function (res) {
    if (res.statusCode !== 204) {
      return cb(error(502, 'Error committing: ' + JSON.stringify(res.body)));
    } else {
      return cb();
    }
  }));
};
module.exports = new Harbourmaster(configs.harbourmaster);