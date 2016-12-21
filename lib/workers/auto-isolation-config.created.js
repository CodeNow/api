/**
 * Handle `auto-isolation-config.created` event
 * @module lib/workers/auto-isolation-config.created
 */
'use strict'

require('loadenv')()

const objectId = require('objectid')
const pick = require('101/pick')
const InputClusterConfig = require('models/mongo/input-cluster-config')
const rabbitMQ = require('models/rabbitmq')
const schemas = require('models/rabbitmq/schemas')

module.exports.jobSchema = schemas.autoIsolationConfigCreated

/**
 * Cluster created event
 * @param {Object} job - Job info
 * @returns {Promise}
 */
module.exports.task = (job) => {
  return InputClusterConfig.findOneAndUpdateAsync({
    _id: objectId(job.meta.inputClusterConfig.id),
    deleted: {
      $exists: false
    }
  }, {
    $set: {
      autoIsolationConfigId: job.autoIsolationConfig.id
    }
  }).then((clusterConfig) => {
    const baseProps = pick(job, ['user', 'organization', 'autoIsolationConfig'])
    const pickedProps = pick(job.meta, ['inputClusterConfig', 'triggeredAction', 'repoFullName'])
    const newJob = Object.assign({}, baseProps, pickedProps)
    rabbitMQ.clusterCreated(newJob)
  })
}
