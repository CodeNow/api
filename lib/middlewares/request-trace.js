/**
 * @module lib/middlewares/request-trace
 */
'use strict';

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
      res.set(process.env.TID_RESPONSE_HEADER_KEY, overrideVal);
    }
    next();
  };
};
