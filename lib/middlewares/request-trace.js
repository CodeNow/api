/**
 * @module lib/middlewares/request-trace
 */
'use strict';

var logger = require('middlewares/logger')(__filename);
var log = logger.log;

/**
 * Initialize namespace. Invoke at beginning of route.
 * Will not overwrite existing namespace when route is used
 * internally via express-request.
 * @param {String} overrideKey
 */
module.exports = function requestTrace(overrideKey) {
  return function(req, res, next) {
    log.trace({
      tx: true,
      overrideKey: overrideKey
    }, 'requestTrace');
    var overrideVal = process.env['TID_' + overrideKey];
    if (overrideVal) {
      log.info({
        tx: true,
        overrideKey: overrideKey,
        overrideVal: overrideVal
      }, 'requestTrace overrideKey exists');
      process.domain.runnableData.tid = overrideVal;
      res.set(process.env.TID_RESPONSE_HEADER_KEY, overrideVal);
    }
    next();
  };
};
