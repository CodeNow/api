var _ = require('lodash');
var utils = require('middleware/utils');
var series = utils.series;
var error = require('error');
var dockworker = require('models/dockworker');
var extensions = require('extensions');
var createModelMiddleware = require('./createModelMiddleware');
var files = module.exports = createModelMiddleware('file', {
  findById: function (fileIdKey) {
    return function (req, res, next) {
      fileId = utils.replacePlaceholders(req, fileIdKey);
      var container = req.container.toJSON ? req.container.toJSON() : req.container;
      if (!container) {
        throw new Error('findContainer before findFile');
      }
      req.file = _.find(container.files, function (file) {
        return utils.equalObjectIds(file._id, fileId);
      });
      next();
    };
  },
  find: function (queryKey) {
    return function (req, res, next) {
      var query = utils.replacePlaceholders(queryKey);
      var container = req.container.toJSON ? req.container.toJSON() : req.container;
      if (!container) {
        throw new Error('findContainer before findFile');
      }
      req.files = _.where(container.files, query);
      next();
    };
  },
  sync: function (req, res, next) {
    res.json(201, {
      message: 'files synced successfully',
      date: new Date()
    });
  }
});