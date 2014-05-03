var keypather = require('keypather')();
var redis = require('models/sharedRedis');

module.exports = {
  containerStatusEvent: function (containerKey) {
    return function (req, res, next) {
      var container = keypather.get(req, containerKey);
      var servicesToken = container.servicesToken;
      var message = container.status;
      var key = ['events', servicesToken, 'progress'].join(':');
      redis.publish(key, message);
      next();
    };
  }
};