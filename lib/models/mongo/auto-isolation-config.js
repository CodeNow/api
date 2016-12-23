/**
 * @module lib/models/mongo/auto-isolation-config
 */
'use strict'

const BaseSchema = require('models/mongo/schemas/base')
const Promise = require('bluebird')
const logger = require('logger').child({ module: 'AutoIsolationConfig' })
const mongoose = require('mongoose')
const objectId = require('objectid')

const auditPlugin = require('./audit-plugin')
const AutoIsolationSchema = require('models/mongo/schemas/auto-isolation-config')

/**
 * Error thrown when an auto-isolation-config is not found
 * @param {Object} query     - query made for AutoIsolationConfig
 * @param {Object} data      - extra error data
 * @param {Object} reporting - reporting options
 */
class NotFoundError extends BaseSchema.NotFoundError {
  constructor (query) {
    super('AutoIsolationConfig not found', { query }, { level: 'debug' })
  }
}

AutoIsolationSchema.statics.NotFoundError = NotFoundError

/**
 * Find active (not deleted) AutoIsolationConfig by `instanceId`
 * @param {ObjectId} instanceId - id of the parent instance
 * @resolves {AutoIsolationConfig} auto-isolation-config config model
 * @rejects {AutoIsolationConfig.NotFoundError}  if active model wasn't found
 */
AutoIsolationSchema.statics.findActiveByInstanceId = function (instanceId) {
  const log = logger.child({
    method: 'findActiveByInstanceId',
    instanceId
  })
  log.info('called')
  const query = {
    instance: objectId(instanceId)
  }
  return AutoIsolationConfig.findOneAsync(query)
    .tap(function (config) {
      if (!config) {
        throw new NotFoundError(query)
      }
    })
}

AutoIsolationSchema.plugin(auditPlugin, {
  NotFoundError
})

const AutoIsolationConfig = module.exports =
  mongoose.model('AutoIsolationConfig', AutoIsolationSchema)

Promise.promisifyAll(AutoIsolationConfig)
