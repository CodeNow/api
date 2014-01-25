var Impl = require('../models/implementations');
var utils = require('./utils');
var series = utils.series;
var createModelMiddleware = require('./createModelMiddleware');

module.exports =  createModelMiddleware(Impl, {
  create: function (/* args */) {
    return series(
      this.findConflict({
        name: 'body.name'
      }),
      this.super.create.apply(this, arguments)
    );
  }
});