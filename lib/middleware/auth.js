var redis = require('../models/redis');
module.exports = {
  hasToken: function (req, res, next) {
    var token = req.get('runnable-token');
    if (!token) {
      res.json(401, { message: 'access token required' });
    } else {
      redis.get(token, req.domain.intercept(function (user_id) {
        if (!user_id) {
          res.json(401, { message: 'must provide a valid access token' });
        } else {
          req.user_id = user_id;
          next();
        }
      }));
    }
  }
};