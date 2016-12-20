/**
 * @module lib/models/mongo/docker-compose-config
 */
'use strict'

const Promise = require('bluebird')
const BaseError = require('error-cat/errors/base-error')
const logger = require('logger').child({ module: 'DockerComposeConfig' })
const mongoose = require('mongoose')
const objectId = require('objectid')

const DockerComposeConfigSchema = require('models/mongo/schemas/docker-compose-config')

/**
 * Error thrown when an docker-compose-config is not found
 * @param {Object} query     - query made for DockerComposeConfig
 * @param {Object} data      - extra error data
 * @param {Object} reporting - reporting options
 */
class NotFoundError extends BaseError {
  constructor (query) {
    super('DockerComposeConfig not found', { query }, { level: 'debug' })
  }
}

DockerComposeConfigSchema.statics.NotFoundError = NotFoundError

/**
 * Mark active docker compose config as deleted
 * @param {ObjectId} configId - id of the config
 * @resolves  if config was marked as deleted
 */
DockerComposeConfigSchema.statics.markAsDeleted = function (configId) {
  const log = logger.child({
    method: 'markAsDeleted',
    configId
  })
  log.info('called')
  return DockerComposeConfig.findOneAndUpdateAsync({
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
 * Find DockerComposeConfig by `id` and assert that it was found
 * @param {ObjectId} configId - id of the config
 * @resolves {DockerComposeConfig} docker compose config model
 * @rejects {DockerComposeConfig.NotFoundError}  if active model wasn't found
 */
DockerComposeConfigSchema.statics.findByIdAndAssert = function (configId) {
  const log = logger.child({
    method: 'findByIdAndAssert',
    configId
  })
  log.info('called')
  return DockerComposeConfig.findByIdAsync(configId)
    .tap(function (config) {
      if (!config) {
        throw new NotFoundError({ _id: configId })
      }
    })
}

const DockerComposeConfig = module.exports = mongoose.model('DockerComposeConfig', DockerComposeConfigSchema)

Promise.promisifyAll(DockerComposeConfig)
Promise.promisifyAll(DockerComposeConfig.prototype)
