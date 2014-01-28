var utils = require('middleware/utils');
var Container = require('models/containers');
var async = require('async');
var _ = require('lodash');
var error = require('error');
var users = require('middleware/users');
var tokens = require('middleware/tokens');
var utils = require('middleware/utils');
var series = utils.series;

var createModelMiddleware = require('./createModelMiddleware');

var containers = module.exports = createModelMiddleware(Container, {
  authChangeUpdateOwners: function (req, res, next) {
    this.update({
      owner: req.user_id
    }, {
      $set: {
        owner: req.me._id.toString()
      }
    })(req, res, next);
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
      var containers = req[self.pluralKey];
      if (containers) {
        async.map(containers, function (container, cb) {
          container.returnJSON(function (err, json) {
            cb(err, json);
          });
        },
        req.domain.intercept(function (containersJSON) {
          req[self.pluralKey] = containersJSON;
          self.super.respondList(req, res, next);
        }));
      }
      else {
        self.super.respond(req, res, next);
      }
    }
  },
  respondTag: function (req, res, next) {
    var channelId = req.channel._id;
    req.container.returnJSON(req.domain.intercept(function (containerJSON) {
      var channelTag = _.findWhere(containerJSON.tags, function (tag) {
        return utils.equalObjectIds(tag.channel, channelId);
      });
      res.json(201, channelTag);
    }));
  }
});