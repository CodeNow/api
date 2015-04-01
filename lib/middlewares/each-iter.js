'use strict';

/**
 * Use inside `mw.req('some-array').each`. Function will take item on each iteration and put it on `eachReq`
 * @param  {String} varName name of the new item from array.
 * @return express middleware
 */
exports.each = function (varName) {
  return function (item req, eachReq, res, next) {
    eachReq[varName] = [];
    next();
  };
};

