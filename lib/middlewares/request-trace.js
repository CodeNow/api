/**
 * @module lib/middlewares/request-trace
 */
'use strict';

var keypather = require('keypather')();

/**
 * Initialize namespace. Invoke at beginning of route.
 * Will not overwrite existing namespace when route is used
 * internally via express-request.
 * @param {String} overrideKey
 */
module.exports = function (overrideKey) {
  return function (req, res, next) {
    var overrideVal = process.env['TID_'+overrideKey];
    if (overrideVal) {
      process.domain.runnableData.tid = overrideVal;
    }
    next();
  };
};

/**
 * set response header w/ TID. Invoke at end of route
 * in order to verify namespace was not lost during route.
 */
module.exports.setTidHeader = function (req, res, next) {
  //log.trace('request-trace.setTidHeader');
  if (!res._headers[process.env.TID_RESPONSE_HEADER_KEY]) {
    //log.trace('request-trace.setTidHeader header already set');
    res.set(process.env.TID_RESPONSE_HEADER_KEY, keypather.get(process, 'domain.runnableData.tid'));
  }
  next();
};
