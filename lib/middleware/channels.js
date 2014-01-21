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
  addAlias: function (req, res, next) {
    Channel.findByIdAndAddAlias(req.channel._id, req.body.name,
      req.domain.intercept(function (updatedChannel) {
        if (updatedChannel) {
          req.channel = updatedChannel;
        }
        next();
      }));
  },
  createChannel: function (req, res, next) {
    res.code = 201;
    var data = _.pick(req.body, 'name', 'description');
    req.channel = new Channel(data);
    next();
  },
  saveChannel: function (req, res, next) {
    req.channel.save(next);
  },
  returnChannel: function (req, res, next) {
    req.channel.returnJSON(req.domain.intercept(function (json) {
      res.json(res.code || 200, json);
    }));
  }
};