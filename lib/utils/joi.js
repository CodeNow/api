'use strict';

var Boom = require('dat-middleware').Boom;
var isFunction = require('101/is-function');
var keypather = require('keypather')();
var last = require('101/last');
var noop = require('101/noop');
var joi = require('joi');

/**
 * validate json using joi and cast errors to boom
 * @param  {Object}   value    value to validate
 * @param  {Object}   schema   joi validation schema
 * @param  {Object}   [options]  joi.validate opts
 * @param  {Function} [callback] callback (sync)
 */
joi.validateOrBoom = function (value /*, schema, options, callback */) {
  var args = Array.prototype.slice.call(arguments);
  var lastArg = last(args);
  var origCb = isFunction(lastArg) ? args.pop() : noop;
  args.push(callback);
  joi.validate.apply(joi, args);
  function callback (err, _value) {
    var message;
    if (err) {
      message = keypather.get(err, 'details[0].message') || 'Invalid data';
      err = Boom.badRequest(message, {
        err: err,
        value: value
      });
    }
    origCb(err, _value);
  }
};

/**
 * mongo objectId string validator
 * @return {joiValidator} joi validator object
 */
joi.objectIdString = function () {
  return joi
    .string()
    .regex(/[0-9a-f]{24}/i, 'ObjectId');
};

module.exports = joi;