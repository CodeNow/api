'use strict'

var bluebird = require('bluebird')
var Boom = require('dat-middleware').Boom
var exists = require('101/exists')
var isFunction = require('101/is-function')
var keypather = require('keypather')()
var last = require('101/last')
var log = require('middlewares/logger')(__filename).log
var noop = require('101/noop')
var ObjectId = require('mongoose').Types.ObjectId
var put = require('101/put')
var joi = require('joi')

/**
 * validate json using joi and cast errors to boom
 * @param  {Object}   value    value to validate
 * @param  {Object}   schema   joi validation schema
 * @param  {Object}   [options]  joi.validate opts
 * @param  {Function} [callback] callback (sync)
 */
joi.validateOrBoom = function (value /*, schema, options, callback */) {
  var args = Array.prototype.slice.call(arguments)
  var logData = {
    tx: true,
    args: args
  }
  log.info(logData, 'joi.validateOrBoom')
  var lastArg = last(args)
  var origCb = isFunction(lastArg) ? args.pop() : noop
  if (!exists(value)) {
    var err = Boom.badRequest('Value does not exist', {
      value: value
    })
    log.error(put({ err: err }, logData), 'joi.validateOrBoom error')
    return origCb(err)
  }
  args.push(callback)
  joi.validate.apply(joi, args)
  function callback (err, _value) {
    var message
    if (err) {
      log.error(put({ err: err }, logData), 'joi.validateOrBoom error')
      var detail = keypather.get(err, 'details[0]')
      if (detail) {
        message = detail.message
      }
      if (detail && detail.path) {
        // ensure keypath is in err message
        message = message.replace(/^"[^"]+"/, '"' + detail.path + '"')
      }
      message = message || 'Invalid data' // backup
      err = Boom.badRequest(message, {
        err: err,
        value: value
      })
    } else {
      log.trace(logData, 'joi.validateOrBoom success')
    }
    origCb(err, _value)
  }
}

/**
 * mongo objectId string validator
 * @return {joiValidator} joi validator object
 */
joi.objectIdString = function () {
  return joi
    .string()
    .regex(/^[0-9a-f]{24}$/i, 'ObjectId')
}

/**
 * mongo objectId validator
 * @return {joiValidator} joi validator object
 */
joi.objectId = function () {
  return joi.alternatives().try(
    joi.object().type(ObjectId),
    joi.objectIdString()
  )
}

bluebird.promisifyAll(joi)

module.exports = joi
