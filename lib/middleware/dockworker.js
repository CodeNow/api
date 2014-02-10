var async = require('async');
var Dockworker = require('models/dockworker');
var utils = require('middleware/utils');

module.exports = {
  updateRunOptions: function (containerKey) {
    return function (req, res, next) {
      var container = utils.replacePlaceholders(req, containerKey);
      async.parallel([
        Dockworker.updateBuildCommand.bind(Dockworker,
          container.servicesToken, container.build_cmd),
        Dockworker.updateStartCommand.bind(Dockworker,
          container.servicesToken, container.start_cmd)
      ], req.domain.intercept(function () {
        next();
      }));
    };
  }
};