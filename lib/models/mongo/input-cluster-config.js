/**
 * @module lib/models/mongo/input-cluster-config
 */
'use strict'

const Promise = require('bluebird')
const BaseError = require('error-cat/errors/base-error')
const logger = require('logger').child({ module: 'InputClusterConfig' })
const mongoose = require('mongoose')
const objectId = require('objectid')

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

/**
 * Mark active docker compose config as deleted
 * @param {ObjectId} configId - id of the config
 * @resolves  if config was marked as deleted
 */
InputClusterConfigSchema.statics.markAsDeleted = function (configId) {
  const log = logger.child({
    method: 'markAsDeleted',
    configId
  })
  log.info('called')
  return InputClusterConfig.findOneAndUpdateAsync({
    _id: objectId(configId),
    deleted: {
      $exists: false
    }
  }, {
    $set: {
      deleted: Date.now()
    }
  })
}

/**
 * Find InputClusterConfig by `id` and assert that it was found
 * @param {ObjectId} configId - id of the config
 * @resolves {InputClusterConfig} docker compose config model
 * @rejects {InputClusterConfig.NotFoundError}  if active model wasn't found
 */
InputClusterConfigSchema.statics.findByIdAndAssert = function (configId) {
  const log = logger.child({
    method: 'findByIdAndAssert',
    configId
  })
  log.info('called')
  return InputClusterConfig.findByIdAsync(configId)
    .tap(function (config) {
      if (!config) {
        throw new NotFoundError({ _id: configId })
      }
    })
}

const InputClusterConfig = module.exports = mongoose.model('InputClusterConfig', InputClusterConfigSchema)

Promise.promisifyAll(InputClusterConfig)
Promise.promisifyAll(InputClusterConfig.prototype)
