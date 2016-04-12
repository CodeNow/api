/**
 * @module lib/models/mongo/auto-isolation-config
 */
'use strict'

var Promise = require('bluebird')
var mongoose = require('mongoose')

var AutoIsolationSchema = require('models/mongo/schemas/auto-isolation-config')

var AutoIsolationConfig = module.exports =
  mongoose.model('AutoIsolationConfig', AutoIsolationSchema)

Promise.promisifyAll(AutoIsolationConfig)
