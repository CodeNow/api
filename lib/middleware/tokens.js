var configs = require('configs');
var redis = require('models/redis');
var uuid = require('node-uuid');
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
  },
  createToken: function (req, res, next) {
    req.access_token = uuid.v4();
    redis.psetex([
      req.access_token,
      configs.tokenExpires,
      req.user._id
    ], next);
  },
  returnToken: function (req, res, next) {
    res.json(200, req.get('runnable-token') || req.access_token);
  }
};