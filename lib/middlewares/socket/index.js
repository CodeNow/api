'use strict'

var modelsIncludes = ['messenger.js']
var path = require('path')
var createClassMiddleware = require('middlewarize')

module.exports = require('middlewares/middlewarize-dir')(
  __dirname,
  path.resolve(__dirname, '../../socket/'),
  createClassMiddleware,
  function (filename) {
    return ~modelsIncludes.indexOf(filename)
  })
