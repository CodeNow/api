var configs = require('../configs');
var request = require('request');
var error = require('../error');
function Harbourmaster (url) {
  this.url = url;
}
Harbourmaster.prototype.commitContainer = function (domain, encodedContainer, token, cb) {
  var container = encodedContainer;
  request({
    pool: false,
    url: '' + this.url + '/containers/' + container.servicesToken + '/commit',
    method: 'POST',
    json: container,
    headers: { 'runnable-token': token }
  }, domain.intercept(function (res) {
    if (res.statusCode !== 204) {
      cb(error(502, 'Error committing: ' + JSON.stringify(res.body)));
    } else {
      cb();
    }
  }));
};
module.exports = new Harbourmaster(configs.harbourmaster);