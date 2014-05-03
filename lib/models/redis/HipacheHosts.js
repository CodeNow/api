var configs = require('configs');
var redis = require('models/sharedRedis');
var url = require('url');

module.exports = HipacheHosts;

function HipacheHosts () {
  this.redis = redis;
}

HipacheHosts.prototype.routeContainerToFrontdoor = function (container, dockIp, cb) {
  var strData = JSON.stringify({
    servicesToken: container.servicesToken,
    startUrl: container.getStartUrl(),
    host: dockIp,
    servicesPort: null,
    webPort: null
  });
  var serviceKey = ['frontend:', container.servicesToken, '.', configs.domain].join('');
  var webKey = ['frontend:', container.webToken, '.', configs.domain].join('');

  var frontdoorUrl = url.format(configs.frontdoor);
  redis.multi()
    .rpush(serviceKey, strData, frontdoorUrl)
    .rpush(webKey, strData, frontdoorUrl)
    .exec(cb);
};

HipacheHosts.prototype.addContainerPorts = function (container, cb) {
  var strData = JSON.stringify({
    servicesToken: container.servicesToken,
    startUrl: container.getStartUrl(),
    host: container.host,
    servicesPort: container.servicesPort,
    webPort: container.webPort
  });
  var serviceKey = ['frontend:', container.servicesToken, '.', configs.domain].join('');
  var webKey = ['frontend:', container.webToken, '.', configs.domain].join('');

  var frontdoorUrl = url.format(configs.frontdoor);
  redis.multi()
    .lset(serviceKey, 0, strData)
    .lset(webKey, 0, strData)
    .exec(cb);
};

HipacheHosts.prototype.removeContainerPorts = function (container, cb) {
  var serviceKey = ['frontend:', container.servicesToken, '.', configs.domain].join('');
  var webKey = ['frontend:', container.webToken, '.', configs.domain].join('');

  redis.multi()
    .del(serviceKey)
    .del(webKey)
    .exec(cb);
};