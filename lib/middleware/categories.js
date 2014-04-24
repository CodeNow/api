var utils = require('middleware/utils');
var series = utils.series;
var Category = require('models/categories');

var createMongooseMiddleware = require('./createMongooseMiddleware');
var categories = module.exports = createMongooseMiddleware(Category, {
  findNameConflict: function (nameKeyPath) {
    return series(
      this.findByName(nameKeyPath),
      utils.unless(this.checkConflict,
        utils.message(409, 'category with name already exists'))
    );
  }
});