/**
 * @module lib/middlewares/check-found
 */
'use strict'

var inflect = require('i')()
var keypather = require('keypather')()
var mw = require('dat-middleware')
var series = require('middleware-flow').series

var logger = require('middlewares/logger')(__filename)

var Boom = mw.Boom

/**
 * Asserts req object has property, responds w/ error w/
 * message & statusCode
 * @param {String} key
 * @param {String} message
 * @param {Number} statusCode
 * @return {Function} middleware
 */
module.exports = function (key, message, statusCode) {
  var capital = inflect.titleize(key)
  message = message || capital + ' not found'
  return series(
    function (req, res, next) {
      logger.log.trace({
        found: !!keypather.get(req, key),
        key: key,
        message: message,
        statusCode: statusCode,
        tx: true
      }, 'check-found')
      next()
    },
    mw.req(key).require()
      .else(
        logger([], 'check-found not found', 'error'),
        mw.next(Boom.create(statusCode || 404, message)))
  )
}
