/**
 * @module lib/middlewares/is-internal-request
 */
'use strict'
var envIs = require('101/env-is')
var Boom = require('dat-middleware').Boom
var logger = require('middlewares/logger')(__filename)
var log = logger.log
/**
 * Allow only internal requests, except if NODE_ENV === 'test'
 */
module.exports = function (req, res, next) {
  log.trace({
    tx: true,
    isInternalRequest: req.isInternalRequest
  }, 'isInternalRequest')
  next((req.isInternalRequest || envIs('test'))
    ? null
    : Boom.notFound())
}
