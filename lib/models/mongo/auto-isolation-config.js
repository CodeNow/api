/**
 * @module lib/models/mongo/auto-isolation-config
 */
'use strict'

const Promise = require('bluebird')
const mongoose = require('mongoose')

const AutoIsolationSchema = require('models/mongo/schemas/auto-isolation-config')

const AutoIsolationConfig = module.exports =
  mongoose.model('AutoIsolationConfig', AutoIsolationSchema)

Promise.promisifyAll(AutoIsolationConfig)
