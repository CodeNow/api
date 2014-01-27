var utils = require('middleware/utils');
var series = utils.series;
var error = require('error');
module.exports = {
  queryFiles: function (req, res, next) {
    req.files = [];
    var content = req.query.content != null;
    var dir = req.query.dir != null;
    var default_tag = req.query.default != null;
    var path = req.query.path;
    if (default_tag) {
      content = true;
      req.container.files.forEach(function (file) {
        if (file.default && (!path || file.path === path)) {
          req.files.push(file.toJSON());
        }
      });
    } else if (dir) {
      req.container.files.forEach(function (file) {
        if (file.dir && (!path || file.path === path)) {
          req.files.push(file.toJSON());
        }
      });
    } else {
      req.container.files.forEach(function (file) {
        if (!path || file.path === path) {
          req.files.push(file.toJSON());
        }
      });
    }
    if (!content) {
      req.files.forEach(function (file) {
        delete file.content;
      });
    }
    next();
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