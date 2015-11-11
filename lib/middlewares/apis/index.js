/**
 * TODO: please write description for this module here
 * when you see this
 * @module lib/middlewares/apis/index
 */
'use strict'

var path = require('path')
var createClassMiddleware = require('middlewares/create-class-middleware')

module.exports = require('middlewares/middlewarize-dir')(
  __dirname,
  path.resolve(__dirname, '../../models/apis/'),
  createClassMiddleware)
