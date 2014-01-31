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
      if (req.query.username) {
        series(
          function (req, res, next) {
            req.users[0].returnJSON(req.domain.intercept(function (user) {
              req.users = [user];
              next();
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