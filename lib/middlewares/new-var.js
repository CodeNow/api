'use strict';

/**
 * Create new empty array and put it on `req` under `varName`.
 * @param  {String} varName name of the empty array that would be attached to the req.
 * @return express middleware
 */
exports.newArray = function (varName) {
  return function (req, res, next) {
    req[varName] = [];
    next();
  };
};

/**
 * Create new empty object and put it on `req` under `varName`.
 * @param  {String} varName name of the empty object that would be attached to the req.
 * @return express middleware
 */
exports.newObject = function (varName) {
  return function (req, res, next) {
    req[varName] = {};
    next();
  };
};