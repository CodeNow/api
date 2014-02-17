var async = require('async');
var Dockworker = require('models/dockworker');
var utils = require('middleware/utils');

module.exports = {
  updateRunOptions: function (containerKey, updateKey) {
    return function (req, res, next) {
      var container = utils.replacePlaceholders(req, containerKey);
      var update = utils.replacePlaceholders(req, updateKey);
      async.parallel([
        function (cb) {
          var newBuildCmd = update.build_cmd;
          if (!utils.exists(newBuildCmd) || container.build_cmd === newBuildCmd) {
            cb();
          }
          else {
            Dockworker.updateBuildCommand(
              container.servicesToken, newBuildCmd, cb);
          }
        },
        function (cb) {
          var newStartCmd = update.start_cmd;
          if (!utils.exists(newStartCmd) || container.start_cmd === newStartCmd) {
            cb();
          }
          else {
            Dockworker.updateStartCommand(
              container.servicesToken, newStartCmd, cb);
          }
        },
      ],
      req.domain.intercept(function () {
        next();
      }));
    };
  }
};