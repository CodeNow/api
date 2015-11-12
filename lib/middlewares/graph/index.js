/**
 * @module lib/middlewares/graph/index
 */
'use strict'

var path = require('path')
var createClassMiddleware = require('middlewares/create-class-middleware')

module.exports = require('middlewares/middlewarize-dir')(
  __dirname,
  path.resolve(__dirname, '../../models/graph/'),
  createClassMiddleware)
