/**
 * @module lib/models/mongo/input-cluster-config
 */
'use strict'

const Promise = require('bluebird')
const logger = require('logger').child({ module: 'InputClusterConfig' })
const mongoose = require('mongoose')
const objectId = require('objectid')

const auditPlugin = require('./audit-plugin')
const InputClusterConfigSchema = require('models/mongo/schemas/input-cluster-config')

InputClusterConfigSchema.plugin(auditPlugin, {
  modelName: 'InputClusterConfig'
})

/**
 * Find active (not deleted) InputClusterConfig by `autoIsolationId`
 *
 * @param {ObjectId} autoIsolationId - _id of the autoIsolation
 *
 * @resolves {InputClusterConfig} input-cluster-config config model
 * @rejects {InputClusterConfig.NotFoundError}  if active model wasn't found
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
