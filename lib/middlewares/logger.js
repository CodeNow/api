/**
 * @module lib/middlewares/logger
 */
'use strict';

var exists = require('101/exists');
var isFunction = require('101/is-function');
var keypather = require('keypather')();

module.exports = function (moduleName) {
  var log = require('logger').child({ module: moduleName }, true);
  var logger = function (keys, msg, level) {
    if (!level) {
      level = 'trace';
    }
    return function (req, res, next) {
      var data = reqData(req, keys);
      log[level](data, msg);
      next();
    };
  };
  logger.log = log;
  return logger;
};

/**
 * Extract specified properties from req object
 */
function reqData (req, keys) {
  var data = {};
  keys.forEach(function (key) {
    data[key] = keypather.get(req, key);
    if (exists(data[key]) && isFunction(data[key].toJSON)) {
      data[key] = data[key].toJSON();
    }
  });
  // will be replaced by serializer
  data.tid = true;
  //data.req = req;
  return data;
}
