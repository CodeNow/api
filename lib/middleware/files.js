var utils = require('middleware/utils');
var series = utils.series;
var error = require('error');
var dockworker = require('models/dockworker');
var extensions = require('extensions');
module.exports = {
  queryFiles: function (req, res, next) {
    var content = req.query.content != null;
    var dir = req.query.dir != null;
    var default_tag = req.query.default != null;
    var path = req.query.path;
    if (default_tag) {
      req.files = [];
      content = true;
      req.container.files.forEach(function (file) {
        if (file.default && (!path || file.path === path)) {
          req.files.push(file.toJSON());
        }
      });
      next();
    } else if (!content) {
      dockworker.files.list({
        directoriesOnly: dir,
        path: req.query.path
      }, req.domain.intercept(function (files) {
        req.files = files;
        next();
      }));
    } else {
      dockworker.files.get({
        path: path,
        extensions: extensions
      }, req.domain.intercept(function (files) {
        res.files = files;
        next();
      }));
    }
  },
  respondList: function (req, res, next) {
    series(
      filesEncodeJSON,
      utils.respond('files')
    )(req, res, next);
    function filesEncodeJSON (req, res, next) {
      next();
    }
  },
  sync: function (req, res, next) {
    res.json(201, {
      message: 'files synced successfully',
      date: new Date()
    });
  }
};