'use strict';

/**
 * Version middleware
 * @module middleware/versions
 */

var Boom = require('dat-middleware').Boom;

var createMongooseMiddleware = require('./createMongooseMiddleware');
var Version = require('models/versions');

module.exports = createMongooseMiddleware(Version, {
  checkFound: function (req, res, next) {
    if (!req[this.key]) {
      next(Boom.notFound(this.key.toString() + ' not found'));
    } else {
      this.verifyContext(req, res, next);
    }
  },
  verifyContext: function (req, res, next) {
    if (req[this.key].context.toString() !== req.context._id.toString()) {
      next(Boom.badRequest('this version is not owned by that context'));
    } else {
      next();
    }
  }
});
