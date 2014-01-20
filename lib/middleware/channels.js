var Channel = require('../models/channels');
var channels = module.exports = {
  fetchChannel: function (req, res, next) {
    var id = req.params && req.params.channelId;
    var name = req.query.name;
    async.waterfall([
      function (cb) {
        if (id) {
          Channels.findById(id, cb);
        }
        else if (name) {
          Channels.findByName(name, cb);
        }
        else {
          cb();
        }
      }
    ],
    domain.intercept(function (channel) {
      req.channel = channel;
      next();
    }));
  }
};