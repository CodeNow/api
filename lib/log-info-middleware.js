/**
 * @module lib/log-info-middleware
 */
'use strict';

var clone = require('101/clone');
var exists = require('101/exists');
var isFunction = require('101/is-function');

module.exports = function (moduleName) {
  var log = require('logger').child({ module: moduleName }, true);
  return function logInfoMiddleware (keys, msg) {
    return function (req, res, next) {
      var data = {};
      keys.forEach(function (key) {
        data[key] = clone(req[key], null, 6);
        if (exists(data[key]) && isFunction(data[key].toJSON)) {
          data[key] = data[key].toJSON();
        }
      });
      log.info(data, msg);
      next();
    };
  };
};

