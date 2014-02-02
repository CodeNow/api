var async = require('async');
var _ = require('lodash');
var error = require('error');
var utils = require('middleware/utils');
var series = utils.series;
var Channel = require('models/channels');
var createModelMiddleware = require('./createModelMiddleware');

var channels = module.exports = createModelMiddleware(Channel, {
  addAliasToChannel: function (req, res, next) {
    req.channel.addAlias(req.body.name, next);
  },
  respondTag: function (req, res, next) {
    var categoryId = req.category._id;
    req.channel.returnJSON(req.domain.intercept(function (channelJSON) {
      var categoryTag = _.findWhere(channelJSON.tags, function (tag) {
        return utils.equalObjectIds(tag.category, categoryId);
      });
      res.json(201, categoryTag);
    }));
  },
  findNameConflict: function (nameKeyPath) {
    return series(
      this.findByName(nameKeyPath),
      utils.unless(this.checkConflict,
        utils.message(409, 'channel with name already exists'))
    );
  },
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