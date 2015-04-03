/**
 * @module lib/middlewares/domains
 */
'use strict';

var domain = require('domain');
var error = require('error');

/**
 * Wrap request handlers w/ domains for error handling
 */
module.exports = function (req, res, next) {
  var d = domain.create();
  req.domain = d;
  d.add(req);
  d.add(res);
  d.on('error', function (err) {
    error.errorHandler(err, req, res, next);
  });
  d.run(next);
};
