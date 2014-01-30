var async = require('async');
var configs = require('configs');
var User = require('models/users');
var _ = require('lodash');
var bcrypt = require('bcrypt');
var error = require('error');
var containers = require('middleware/containers');
var utils = require('middleware/utils');
var body = require('middleware/body');
var series = utils.series;
var ternary = utils.ternary;
var createModelMiddleware = require('./createModelMiddleware');

var users = module.exports = createModelMiddleware(User, {
  respond: function (req, res, next) {
    if (req[this.key]) {
      series(
        this.model.returnJSON(),
        this.super.respond
      )(req, res, next);
    }
    else if (req.users) {
      if (req.users.length === 1) {
        series(
          function (req, res, next) {
            async.map(req.users, function (user, cb) {
              user.returnJSON(cb);
            }, req.domain.intercept(function (users) {
              req.users = users;
            }));
          },
          this.respondList
        )(req, res, next);
      } else {
        this.respondList(req, res, next);
      }
    }
    else {
      this.checkFound(req, res, next);
    }
  }
});