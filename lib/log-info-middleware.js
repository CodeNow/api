/**
 * @module lib/log-info-middleware
 */
'use strict';

var isFunction = require('101/is-function');
var keypather = require('keypather')();

module.exports = function (moduleName) {
  var log = require('logger').child({ module: moduleName }, true);
  return function logInfoMiddleware (keys, msg) {
    return function (req, res, next) {
      var data = {};
      keys.forEach(function (key) {
        data[key] = req[key];
        if (isFunction(keypather.get(req, key+'.toJSON'))) {
          data[key] = data[key].toJSON();
        }
      });
      log.info(data, msg);
      next();
    };
  };
};

