/**
 * TODO: please write description for this module here
 * when you see this
 * @module lib/middlewares/middlewarize-dir
 */
'use strict'

var fs = require('fs')
var inflect = require('i')()
var path = require('path')

// this file automatically generates middlewares from the models folder
// if they do not exist in the middlewares folder
module.exports = function (mwDirPath, modelsDirPath, middlewarize, filter, pluralize) {
  var middlewares = {}

  fs.readdirSync(mwDirPath).forEach(function (filename) {
    if (filename === 'index.js' || !~filename.indexOf('.js')) { return }
    var lower = filename.replace(/\.js$/, '').toLowerCase()
    var middleware = require(path.join(mwDirPath, filename))
    var camel = inflect.camelize(inflect.underscore(lower), false)
    middlewares[camel] = middleware
  })

  fs.readdirSync(modelsDirPath).forEach(function (filename) {
    if (!~filename.indexOf('.js')) { return }
    if (filter && !filter(filename)) { return }
    var lower = filename.replace(/\.js$/, '').toLowerCase()
    var camel = inflect.camelize(inflect.underscore(lower), false)
    if (middlewares[camel]) { return }
    var Model = require(path.join(modelsDirPath, filename))
    var method = pluralize ? inflect.pluralize(camel) : camel
    middlewares[method] = middlewarize(Model, camel)
  })

  return middlewares
}
