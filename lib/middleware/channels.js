var async = require('async');
var _ = require('lodash');
var error = require('../error');
var Channel = require('../models/channels');
var channels = module.exports = {
  fetchChannel: function (req, res, next) {
    var id = req.params && req.params.channelId;
    var name = req.params && req.params.channelName;
    async.waterfall([
      function (cb) {
        if (id) {
          Channel.findById(id, cb);
        }
        else if (name) {
          Channel.findByName(name, cb);
        }
        else {
          cb();
        }
      }
    ],
    req.domain.intercept(function (channel) {
      if (!channel) {
        return next(error(404, 'channel not found'));
      }
      req.channel = channel;
      next();
    }));
  },
  addAliasToChannel: function (req, res, next) {
    req.channel.addAlias(req.body.name, next);
  },
  createChannel: function (req, res, next) {
    res.code = 201;
    var data = _.pick(req.body, 'name', 'description');
    req.channel = new Channel(data);
    next();
  },
  saveChannel: function (req, res, next) {
    req.channel.save(req.domain.intercept(function (channel) {
      req.channel = channel;
      next();
    }));
  },
  returnChannel: function (req, res, next) {
    req.channel.returnJSON(req.domain.intercept(function (json) {
      res.json(res.code || 200, json);
    }));
  },
  queryChannels: function (req, res, next) {
    var name = req.query.name;
    var query = name ? { aliases: name } : {};
    Channel.find(query, req.domain.intercept(function (channels) {
      req.channels = channels;
      next();
    }));
  },
  returnChannels: function (req, res, next) {
    async.map(req.channels, function (channel, cb) {
      channel.returnJSON(cb);
    },
    req.domain.intercept(function (channels) {
      res.json(channels);
    }));
  }
};