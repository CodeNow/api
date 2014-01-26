var async = require('async');
var configs = require('configs');
var User = require('models/users');
var _ = require('lodash');
var bcrypt = require('bcrypt');
var error = require('error');
var containers = require('middleware/containers');
var utils = require('middleware/utils');
var series = utils.series;
var ternary = utils.ternary;
var createModelMiddleware = require('./createModelMiddleware');

var users = module.exports = createModelMiddleware(User, {
  register: function (req, res, next) {
    series(
      body.requireOne('email', 'username'),
      body.require('password'),
      this.findConflict({
        $or: [
          { email: 'body.email' },
          { username: 'body.username' }
        ]
      }),
      this.create,
      this.model.set('body'),
      this.model.save(),
      containers.authChangeUpdateOwners
    )(req, res, next);
  },
  login: function (loginData) {
    return series(
      users.find({
        $or: [
          { email: 'body.email' },
          { username: 'body.username' }
        ]
      }),
      users.checkFound,
      users.checkUserPassword('user', 'body.password'),
      containers.authChangeUpdateOwners);
  },
  checkUserPassword: function (user, password) {
    return function (req, res, next) {
      user.checkPassword(password, req.domain.intercept(function (matches) {
        if (!matches) {
          return next(error(403, 'invalid password'));
        }
        next();
      }));
    };
  }
});