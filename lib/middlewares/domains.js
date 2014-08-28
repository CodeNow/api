'use strict';

var error = require('error');
var domain = require('domain');

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
