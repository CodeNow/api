var client = require('../models/harbourmaster');
var harbourmaster = module.exports = {
  createContainer: function (req, res, next) {
    client.createContainer(req.domain, req.container, next);
  }
};