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
    else if (req[this.pluralKey]) {
      this.respondList(req, res, next);
    }
    else {
      this.checkFound(req, res, next);
    }
  },
  respondList: function (req, res, next) {
    var self = this;
    series(
      returnAllJSON,
      this.super.respond
    )(req, res, next);
    function returnAllJSON (req, res, next) {
      var models = req[self.pluralKey];
      if (models) {
        async.map(models, function (image, cb) {
          image.returnJSON(cb);
        },
        req.domain.intercept(function (models) {
          req[self.pluralKey] = models;
          self.super.respondList(req, res, next);
        }));
      }
      else {
        self.super.respond(req, res, next);
      }
    }
  }
});