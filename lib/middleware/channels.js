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
  }
});