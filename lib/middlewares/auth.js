'use strict';

var Boom = require('dat-middleware').Boom;

module.exports = {
  requireAuth: function (req, res, next) {
    if (!req.sessionUser) {
      next(Boom.unauthorized('Unauthorized'));
    }
    else {
      next();
    }
  }
};