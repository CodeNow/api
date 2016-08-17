/**
 * @module lib/middlewares/logger
 */
'use strict'

var exists = require('101/exists')
var isFunction = require('101/is-function')
var keypather = require('keypather')()
var path = require('path')
var logger = require('logger')

module.exports = function (moduleName) {
  // relative path to file name
  moduleName = path.relative(process.cwd(), moduleName)
  var log = logger.child({
    module: moduleName
  }, true)
  var mwLogger = function (keys, message, level) {
    if (!level) {
      level = 'trace'
    }
    if (!message) {
      message = keys
      keys = []
    }
    return function (req, res, next) {
      var data = reqData(req, keys)
      log[level](data, message)
      next()
    }
  }
  mwLogger.log = log
  return mwLogger
}

/**
 * Extract specified properties from req object
 */
function reqData (req, keys) {
  var data = {}
  keys.forEach(function (key) {
    data[key] = keypather.get(req, key)
    if (exists(data[key]) && isFunction(data[key].toJSON)) {
      data[key] = data[key].toJSON()
    }
  })
  // will be replaced by serializer
  data.req = req
  return data
}
