/**
 * @module lib/models/mongo/auto-isolation-config
 */
'use strict'

const BaseError = require('error-cat/errors/base-error')
const Promise = require('bluebird')
const logger = require('logger').child({ module: 'AutoIsolationConfig' })
const mongoose = require('mongoose')
const objectId = require('objectid')

const AutoIsolationSchema = require('models/mongo/schemas/auto-isolation-config')

/**
 * Error thrown when an auto-isolation-config is not found
 * @param {Object} query     - query made for AutoIsolationConfig
 * @param {Object} data      - extra error data
 * @param {Object} reporting - reporting options
 */
class NotFoundError extends BaseError {
  constructor (query) {
    super('AutoIsolationConfig not found', { query }, { level: 'debug' })
  }
}

AutoIsolationSchema.statics.NotFoundError = NotFoundError

/**
 * Mark auto-isolation-config as deleted
 * @param {ObjectId} autoIsolationConfigId - id of the AutoIsolationConfig
 * @resolves  if auto-isolation-config was marked as deleted
 */
AutoIsolationSchema.statics.markAsDeleted = function (autoIsolationConfigId) {
  const log = logger.child({
    method: 'markAsDeleted',
    autoIsolationConfigId
  })
  log.info('called')
  return AutoIsolationConfig.findOneAndUpdateAsync({
    _id: objectId(autoIsolationConfigId),
    deleted: {
      $exists: false
    }
  }, {
    $set: {
      deleted: Date.now()
    }
  }, {
    new: true
  })
}

/**
 * Find AutoIsolationConfig by `id` and assert that it was found
 * @param {ObjectId} autoIsolationConfigId - id of the AutoIsolationConfig
 * @resolves {AutoIsolationConfig} AutoIsolationConfig model
 * @rejects {AutoIsolationConfig.NotFoundError}  if active model wasn't found
 */
AutoIsolationSchema.statics.findByIdAndAssert = function (autoIsolationConfigId) {
  const log = logger.child({
    method: 'findByIdAndAssert',
    autoIsolationConfigId
  })
  log.info('called')
  const _id = objectId(autoIsolationConfigId)
  return AutoIsolationConfig.findOneActive({ _id })
}

/**
 * Find active (not deleted) AutoIsolationConfig by `query`
 * @param {Object} query - query to find AutoIsolationConfig
 * @resolves {AutoIsolationConfig} AutoIsolationConfig model
 * @rejects {AutoIsolationConfig.NotFoundError}  if active model wasn't found
 */
AutoIsolationSchema.statics.findOneActive = function (query) {
  const log = logger.child({
    method: 'findOneActive',
    query
  })
  log.info('called')
  const activeQuery = Object.assign({},
    query,
    {
      deleted: {
        $exists: false
      }
    }
  )
  log.trace({ activeQuery }, 'active query')
  return AutoIsolationConfig.findOneAsync(activeQuery)
    .tap(function (aic) {
      if (!aic) {
        throw new NotFoundError(query)
      }
    })
}

/**
 * Find all active (not deleted) AutoIsolationConfigs by `query`
 * @param {Object} query - query to find AutoIsolationConfig
 * @resolves {Array[AutoIsolationConfig]} array of AutoIsolationConfig model
 */
AutoIsolationSchema.statics.findAllActive = function (query) {
  const log = logger.child({
    method: 'findOneActive',
    query
  })
  log.info('called')
  const activeQuery = Object.assign({},
    query,
    {
      deleted: {
        $exists: false
      }
    }
  )
  log.trace({ activeQuery }, 'active query')
  return AutoIsolationConfig.findAsync(activeQuery)
}

/**
 * Find active (not deleted) AutoIsolationConfig by `instanceId`
 * @param {ObjectId} instanceId - id of the parent instance
 * @resolves {AutoIsolationConfig} auto-isolation-config config model
 * @rejects {AutoIsolationConfig.NotFoundError}  if active model wasn't found
 */
AutoIsolationSchema.statics.findActiveByInstanceId = function (instanceId) {
  const log = logger.child({
    method: 'findActiveByParentId',
    instanceId
  })
  log.info('called')
  const query = {
    instance: objectId(instanceId),
    deleted: {
      $exists: false
    }
  }
  return AutoIsolationConfig.findOneAsync(query)
    .tap(function (config) {
      if (!config) {
        throw new NotFoundError(query)
      }
    })
}

const AutoIsolationConfig = module.exports =
  mongoose.model('AutoIsolationConfig', AutoIsolationSchema)

Promise.promisifyAll(AutoIsolationConfig)
