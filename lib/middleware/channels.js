var Channel = require('../models/channels');
var channels = module.exports = {
  fetchChannel: function (req, res, next) {
    var id = req.params.channelId;
    var name = req.params.channelName;
    if (id) {
      Channels.findById(id, next);
    }
    else if (name) {
      Channels.findByName(name, next);
    }
    else {
      next();
    }
  }
};