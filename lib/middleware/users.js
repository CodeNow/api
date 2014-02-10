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
    var self = this;
    var model = req[this.key];
    if (model) {
      if (!model.get('gravitar')) {
        model.set('gravitar', model.toJSON()._gravitar, { strict: false });
      }
      if (model.returnJSON) {
        model.returnJSON(req.domain.intercept(function (json) {
          req[self.key] = json;
          self.super.respond(req, res, next);
        }));
      }
      else {
        self.super.respond(req, res, next);
      }
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
    var models = req[this.pluralKey];
    async.map(models, function (model, cb) {
      if (!model.get('gravitar')) {
        model.set('gravitar', model.toJSON()._gravitar, { strict: false });
      }
      if (model.returnJSON) {
        model.returnJSON(cb);
      }
      else {
        cb(null, model);
      }
    },
    req.domain.intercept(function (models) {
      req[self.pluralKey] = models;
      self.super.respondList(req, res, next);
    }));
  }
});