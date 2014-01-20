var async = require('async');
var Channel = require('../models/channels');
var channels = module.exports = {
  fetchChannel: function (req, res, next) {
    var id = req.params && req.params.channelId;
    var name = req.query.name;
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
      req.channel = channel;
      next();
    }));
  }
};