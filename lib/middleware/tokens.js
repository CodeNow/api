'use strict';

var Boom = require('dat-middleware').Boom;

var configs = require('configs');
var redis = require('models/redis');
var uuid = require('node-uuid');
module.exports = {
  hasToken: function (req, res, next) {
    if (req.query.map) {
      return next(); // sitemap routes do not need token
    }
    var token = req.get('runnable-token');
    if (isContainerStartStopRoute(req.url) && req.query.servicesToken) {
      next();
    }
    else if (!token) {
      next(Boom.unauthorized('access token required'));
    } else {
      redis.get(token, req.domain.intercept(function (userId) {
        if (!userId) {
          next(Boom.unauthorized('must provide a valid access token' ));
        } else {
          req.user_id = userId; // TODO: deprecate the snake case!
          req.userId = userId;
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

var startStopRouteRegExp = /^\/(users\/)?[^\/]+\/runnables\/[^\/]+\/(start|stop).*/;
function isContainerStartStopRoute (url) {
  return startStopRouteRegExp.test(url);
}
