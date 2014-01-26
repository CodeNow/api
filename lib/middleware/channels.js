var async = require('async');
var _ = require('lodash');
var error = require('error');
var Channel = require('models/channels');
var createModelMiddleware = require('./createModelMiddleware');

module.exports = createModelMiddleware(Channel, {
  addAliasToChannel: function (req, res, next) {
    req.channel.addAlias(req.body.name, next);
  }
});