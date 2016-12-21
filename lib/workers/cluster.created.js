/**
 * Handle `cluster.created` event
 * @module lib/workers/cluster.created
 */
'use strict'

require('loadenv')()

const Promise = require('bluebird')
const logger = require('logger')
const pick = require('101/pick')
const rabbitMQ = require('models/rabbitmq')
const schemas = require('models/rabbitmq/schemas')

module.exports.jobSchema = schemas.clusterCreated

/**
 * Cluster created event
 * @param {Object} job - Job info
 * @returns {Promise}
 */
module.exports.task = (job) => {
  const log = logger.child({ method: 'ClusterCreatedWorker', job })
  const parsedInstancesDef = job.parsedCompose.results
  return Promise.map(parsedInstancesDef, (parsedComposeInstanceData) => {
    const pickedProps = pick(job, ['inputClusterConfig', 'autoIsolationConfig', 'user', 'organization', 'triggeredAction', 'repoFullName'])
    const newJob = Object.assign({ parsedComposeInstanceData }, pickedProps)
    log.trace({ newJob }, 'publish new task to create instance')
    rabbitMQ.createClusterInstance(newJob)
  })
}
