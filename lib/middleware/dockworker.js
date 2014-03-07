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
  },
  runBuildCmd: function (req, res, next) {
    var container = utils.replacePlaceholders(req, 'container');
    Dockworker.runCommand({
      servicesToken: container.servicesToken,
      command: container.build_cmd
    }, function(err, res, body) {
      if(err) {
        buildErr = new Error("Build Error");
        buildErr.stderr = err.msg;
        next(buildErr);
      } else {
        next();
      }
    });
  }
};