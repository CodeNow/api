'use strict';

// var rollbar = require('rollbar');
var Boom = require('dat-middleware').Boom;
var configs = require('configs');

var error = module.exports = function (code, msg, data) {
  return Boom.create(code, msg, data);
};

error.log = function (err) {
  console.error(err.message);
  console.error(err.stack);
  if (err.data && err.data.err) {
    console.error('---original error---');
    console.error(err.data.err.message);
    console.error(err.data.err.stack);
  }
};
error.wrapIfErr = function (cb, status, message) {
  return function (err) {
    if (err && err.isBoom) {
      err = err.data.err; // unwrap if already wrapped
    }
    if (err) {
      cb(Boom.create(status, message, { err: err }));
    }
    else {
      cb.apply(this, arguments);
    }
  };
};
error.errorHandler = function (err, req, res, next) {
  if (!err.isBoom) {
    err = error(500, 'unknown', { err: err });
  }
  err.reformat();
  if (configs.logErrors && err.output.statusCode >= 500) {
    error.log(err);
  }
  // if (err.output.statusCode === 500) {
  //   throw err;
  // }
  // else {
  res.json(err.output.statusCode, err.output.payload);
  next.lintIsStupidSometimes = true;
  // }
};