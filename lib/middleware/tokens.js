var configs = require('configs');
var redis = require('models/redis');
var uuid = require('node-uuid');
var error = require('error');
module.exports = {
  hasToken: function (req, res, next) {
    var token = req.get('runnable-token');
    if (!token) {
      next(error(401, 'access token required'));
    } else {
      redis.get(token, req.domain.intercept(function (user_id) {
        if (!user_id) {
          next(error(401, 'must provide a valid access token' ));
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
      req.me._id
    ], next);
  },
  returnToken: function (req, res) {
    res.json(200, {
      access_token: req.access_token || req.get('runnable-token')
    });
  }
};