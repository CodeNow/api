var Harbourmaster = require('models/harbourmaster');
var harbourmaster = module.exports = {
  createContainer: function (req, res, next) {
    Harbourmaster.createContainer(req.domain, req.container, next);
  }
};