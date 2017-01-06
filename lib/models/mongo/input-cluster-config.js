/**
 * @module lib/models/mongo/input-cluster-config
 */
'use strict'

const Promise = require('bluebird')
const mongoose = require('mongoose')

const auditPlugin = require('./audit-plugin')
const InputClusterConfigSchema = require('models/mongo/schemas/input-cluster-config')

InputClusterConfigSchema.plugin(auditPlugin, {
  modelName: 'InputClusterConfig'
})

/**
 * Find active (not deleted) AutoIsolationConfig by `instanceId`
 * @param {ObjectId} instanceId - id of the parent instance
 * @resolves {AutoIsolationConfig} auto-isolation-config config model
 * @rejects {AutoIsolationConfig.NotFoundError}  if active model wasn't found
 */
InputClusterConfigSchema.statics.findActiveByAutoIsolationId = function (autoIsolationId) {
  const log = logger.child({
    method: 'findActiveByAutoIsolationId',
    autoIsolationId
  })
  log.info('called')
  const query = {
    autoIsolationId: objectId(autoIsolationId)
  }
  return InputClusterConfig.findOneActive(query)
}

const InputClusterConfig = module.exports = mongoose.model('InputClusterConfig', InputClusterConfigSchema)


Promise.promisifyAll(InputClusterConfig)
Promise.promisifyAll(InputClusterConfig.prototype)
