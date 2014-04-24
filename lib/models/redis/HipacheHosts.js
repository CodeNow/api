var configs = require('configs');
var redis = require('models/sharedRedis');

module.exports = HipacheHosts;

function HipacheHosts () {
  this.redis = redis;
}

HipacheHosts.prototype.createHostForContainer = function (token, container, cb) {
  var startUrl = [ // TODO: authentication
    'http://api.', configs.domain,
    '/users/me/runnables/', container._id, '/start'
  ].join('');

  var strData = JSON.stringify({
    servicesToken: container.servicesToken,
    startUrl: startUrl,
    host: null,
    servicesPort: null,
    webPort: null,
    token: token
  });

  var serviceKey = ['frontend:', container.servicesToken, '.', configs.domain].join('');
  var webKey = ['frontend:', container.webToken, '.', configs.domain].join('');
  // maintain subdomain for apis?


  redis.multi()
    .rpush(serviceKey, strData, frontdoorUrl)
    .rpush(webKey, strData, frontdoorUrl)
    .exec(cb);
};