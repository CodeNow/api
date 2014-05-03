var async = require('async');
var User = require('models/users');
var createMongooseMiddleware = require('./createMongooseMiddleware');

var users = module.exports = createMongooseMiddleware(User, {
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
    var jsonOpts = {};
    if (models.length !== 1) {
      jsonOpts.noImageCounts = true;
    }
    async.map(models, function (model, cb) {
      if (!model.get('gravitar')) {
        model.set('gravitar', model.toJSON()._gravitar, { strict: false });
      }
      if (model.returnJSON) {
        model.returnJSON(jsonOpts, cb);
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