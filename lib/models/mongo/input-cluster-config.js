/**
 * @module lib/models/mongo/input-cluster-config
 */
'use strict'

const Promise = require('bluebird')
const logger = require('logger').child({ module: 'InputClusterConfig' })
const mongoose = require('mongoose')
const objectId = require('objectid')

const auditPlugin = require('./audit-plugin')
const BaseSchema = require('models/mongo/schemas/base')
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
    autoIsolationConfigId: objectId(autoIsolationId)
  }
  return InputClusterConfig.findOneActive(query)
}

/**
 *
 * @param {AutoIsolationConfig} autoIsolationConfig
 * @param {Object}              clusterOpts
 * @param {String}              clusterOpts.filePath
 * @param {String}              clusterOpts.fileSha
 * @param {String=}             clusterOpts.clusterName
 * @param {ObjectId=}           clusterOpts.parentInputClusterConfigId - cluster id of the staging master
 *
 * @resolves {InputClusterConfig} updated cluster model
 */
InputClusterConfigSchema.statics.updateConfig = function (autoIsolationConfig, clusterOpts) {
  const log = logger.child({
    method: 'createOrUpdate',
    autoIsolationConfig, clusterOpts
  })
  log.trace('called')
  const opts = Object.assign(clusterOpts, { autoIsolationConfigId: autoIsolationConfig._id })

  return InputClusterConfig.findActiveByAutoIsolationId(autoIsolationConfig._id)
    .tap(inputClusterConfig => inputClusterConfig.set(opts))
    .then(inputClusterConfig => inputClusterConfig.saveAsync())
}

const InputClusterConfig = module.exports = mongoose.model('InputClusterConfig', InputClusterConfigSchema)

Promise.promisifyAll(InputClusterConfig)
Promise.promisifyAll(InputClusterConfig.prototype)

/**
 * Error thrown instance failed to create
 * @param {string} opts - data object given to the instance creation
 */
InputClusterConfig.NotChangedError = class extends BaseSchema.NotChangedError {
  constructor (opts) {
    super('InputClusterConfig', opts, 'debug')
  }
}
