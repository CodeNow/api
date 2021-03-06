/**
 * @module lib/models/mongo/auto-isolation-config
 */
'use strict'

const Promise = require('bluebird')
const logger = require('logger').child({ module: 'AutoIsolationConfig' })
const mongoose = require('mongoose')
const objectId = require('objectid')

const auditPlugin = require('./audit-plugin')
const AutoIsolationSchema = require('models/mongo/schemas/auto-isolation-config')
const Instance = require('models/mongo/instance')

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
  return AutoIsolationConfig.findOneActive(query)
}

/**
 * Find active (not deleted) AutoIsolationConfig by `instanceId`
 * @param {ObjectId} instanceId - id of the parent instance or dependency instance
 * @resolves {AutoIsolationConfig} auto-isolation-config config model
 * @rejects {AutoIsolationConfig.NotFoundError}  if active model wasn't found
 */
AutoIsolationSchema.statics.findActiveByAnyInstanceId = function (instanceId) {
  const log = logger.child({
    method: 'findActiveByAnyInstanceId',
    instanceId
  })
  log.info('called')
  const query = {
    $or: [
      { instance: objectId(instanceId) },
      {
        requestedDependencies: {
          $elemMatch: {
            instance: objectId(instanceId)
          }
        }
      }
    ]
  }
  return AutoIsolationConfig.findOneActive(query)
}

/**
 * Find active (not deleted) AutoIsolationConfigs by instanceId
 *
 * @param {ObjectId[]} instanceIds - ids of the parent instances or dependency instances
 *
 * @resolves {AutoIsolationConfig} auto-isolation-config config model
 * @rejects {AutoIsolationConfig.NotFoundError}  if active model wasn't found
 */
AutoIsolationSchema.statics.findActiveByAnyInstanceIds = function (instanceIds) {
  const log = logger.child({
    method: 'findActiveByAnyInstanceIds',
    instanceIds
  })
  log.info('called')
  const inQuery = { $in: instanceIds.map(objectId) }
  const query = {
    $or: [
      { instance: inQuery },
      {
        requestedDependencies: {
          $elemMatch: {
            instance: inQuery
          }
        }
      }
    ]
  }
  return AutoIsolationConfig.findAllActive(query)
}

/**
 * Find active (not deleted) AutoIsolationConfig by `instanceId`
 *
 * @param {String} shortHash - shortHash of the parent instance
 *
 * @resolves {AutoIsolationConfig} auto-isolation-config config model
 * @rejects {AutoIsolationConfig.NotFoundError}  if active model wasn't found
 */
AutoIsolationSchema.statics.findActiveByInstanceShortHash = function (shortHash) {
  const log = logger.child({
    method: 'findActiveByInstanceId',
    shortHash
  })
  log.info('called')
  return Instance.findInstanceIdByShortHash(shortHash)
    .then(instance => AutoIsolationConfig.findOneActive({ instance }))
    .catchThrow(Instance.NotFoundError, new AutoIsolationConfig.NotFoundError('Could not find instance'))
}

AutoIsolationSchema.plugin(auditPlugin, {
  modelName: 'AutoIsolationConfig'
})

const AutoIsolationConfig = module.exports =
  mongoose.model('AutoIsolationConfig', AutoIsolationSchema)

Promise.promisifyAll(AutoIsolationConfig)
Promise.promisifyAll(AutoIsolationConfig.prototype)
