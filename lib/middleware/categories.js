var async = require('async');
var _ = require('lodash');
var error = require('error');
var utils = require('middleware/utils');
var series = utils.series;
var Category = require('models/categories');

var createModelMiddleware = require('./createModelMiddleware');
var categories = module.exports = createModelMiddleware(Category, {
  findNameConflict: function (nameKeyPath) {
    return series(
      this.findByName(nameKeyPath),
      utils.unless(this.checkConflict,
        utils.message(409, 'category with name already exists'))
    );
  }
});