var async = require('async');
var _ = require('lodash');
var utils = require('middleware/utils');
var series = utils.series;
var Channel = require('models/channels');
var createMongooseMiddleware = require('./createMongooseMiddleware');

var channels = module.exports = createMongooseMiddleware(Channel, {
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
  findAllByName: function (nameKeyPath) {
    return function (req, res, next) {
      var channelNames = utils.replacePlaceholders(req, nameKeyPath);
      channelNames = (typeof channelNames === 'string') ? [channelNames] : channelNames;
      async.map(channelNames,
        function (name, cb) {
          Channel.findOne({ aliases: name.toString().toLowerCase() }, { _id: 1 }, cb);
        },
        function (err, results) {
          if (!err) {
            req.channel = _.reduce(results, function (memo, channel) {
              memo.push(channel._id);
              return memo;
            }, []);
          }
          next(err);
        }
      );
    };
  },
  findNameConflict: function (nameKeyPath) {
    return series(
      this.findByName(nameKeyPath),
      utils.unless(this.checkConflict,
        utils.message(409, 'channel with name already exists'))
    );
  },
  respond: function (req, res, next) {
    var self = this;
    var model = req[this.key];
    if (model) {
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
