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
 * @param {ObjectId}            autoIsolationConfig._id
 * @param {Object}              clusterOpts
 * @param {String}              clusterOpts.repo                       - full repo where the ICC exists(user/repo)
 * @param {String}              clusterOpts.branch                     - branch where this ICC exists
 * @param {String}              clusterOpts.filePath
 * @param {String}              clusterOpts.fileSha
 * @param {String=}             clusterOpts.createdByUser
 * @param {String=}             clusterOpts.ownedByOrg
 * @param {Boolean=}            clusterOpts.isTesting
 * @param {ObjectId=}           clusterOpts.parentInputClusterConfigId - cluster id of the staging master
 * @param {Object=}             masterClusterOpts                      - cluster model of masterpod
 * @param {String}              masterClusterOpts._id                  - cluster model of masterpod
 * @param {String}              masterClusterOpts.clusterName          - Name of the cluster
 * @param {String}              masterClusterOpts.parentInputClusterConfigId - Config Id for master staging
 *
 * @resolves {InputClusterConfig} updated cluster model
 */
InputClusterConfigSchema.statics.createOrUpdateConfig = function (autoIsolationConfig, clusterOpts, masterClusterOpts) {
  const log = logger.child({
    method: 'createOrUpdateConfig',
    autoIsolationConfig, clusterOpts, masterClusterOpts
  })
  log.trace('called')
  const opts = Object.assign(clusterOpts, { autoIsolationConfigId: autoIsolationConfig._id })

  return InputClusterConfig.findActiveByAutoIsolationId(autoIsolationConfig._id)
    .tap(inputClusterConfig => inputClusterConfig.set(opts))
    .then(inputClusterConfig => inputClusterConfig.saveAsync())
    .catch(InputClusterConfig.NotFoundError, () => {
      // ICC couldn't be found to update, so we need to create a new one.
      const masterOpts = {}
      if (masterClusterOpts) { // Newly created masters don't have this
        masterOpts.parentInputClusterConfigId = masterClusterOpts.parentInputClusterConfigId || masterClusterOpts._id
        masterOpts.clusterName = masterClusterOpts.clusterName
      }
      const newOpts = Object.assign(masterOpts, opts)
      log.trace({ newOpts }, 'Creating an ICC with these opts')
      return InputClusterConfig.createAsync(newOpts)
    })
    .catch(err => {
      log.error({ err, opts }, 'Failed to create or update the ICC')
      throw err
    })
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
