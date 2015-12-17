/**
 * Middlewares for all the services.
 * @module lib/middlewares/services/index
 */
'use strict'

var path = require('path')
var createClassMiddleware = require('middlewares/create-class-middleware')

module.exports = require('middlewares/middlewarize-dir')(
  __dirname,
  path.resolve(__dirname, '../../models/services/'),
  createClassMiddleware)
