/**
 * @module lib/middlewares/check-found
 */
'use strict';

var inflect = require('i')();
var mw = require('dat-middleware');
var series = require('middleware-flow').series;

var Boom = mw.Boom;

/**
 * Asserts req object has property, responds w/ error w/
 * message & statusCode
 * @param {String} key
 * @param {String} message
 * @param {Number} statusCode
 * @return {Function} middleware
 */
module.exports = function (key, message, statusCode) {
  var capital = inflect.titleize(key);
  message = message || capital+' not found';
  return series(
    mw.req(key).require()
      .else(mw.next(Boom.create(statusCode || 404, message)))
  );
};
