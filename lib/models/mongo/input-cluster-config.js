/**
 * @module lib/models/mongo/input-cluster-config
 */
'use strict'

const Promise = require('bluebird')
const BaseError = require('error-cat/errors/base-error')
const logger = require('logger').child({ module: 'InputClusterConfig' })
const mongoose = require('mongoose')

const auditPlugin = require('./audit-plugin')
const InputClusterConfigSchema = require('models/mongo/schemas/input-cluster-config')

/**
 * Error thrown when an input-cluster-config is not found
 * @param {Object} query     - query made for InputClusterConfig
 * @param {Object} data      - extra error data
 * @param {Object} reporting - reporting options
 */
class NotFoundError extends BaseError {
  constructor (query) {
    super('InputClusterConfig not found', { query }, { level: 'debug' })
  }
}

InputClusterConfigSchema.statics.NotFoundError = NotFoundError

AutoIsolationSchema.plugin(auditPlugin, {
  NotFoundError
})

const InputClusterConfig = module.exports = mongoose.model('InputClusterConfig', InputClusterConfigSchema)

Promise.promisifyAll(InputClusterConfig)
Promise.promisifyAll(InputClusterConfig.prototype)
