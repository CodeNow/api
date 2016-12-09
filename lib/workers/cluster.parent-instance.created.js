/**
 * Handle `cluster.parent-instance.created` event
 * @module lib/workers/cluster.parent-instance.created
 */
'use strict'

require('loadenv')()

const Promise = require('bluebird')
const logger = require('logger')
const pick = require('101/pick')
const rabbitMQ = require('models/rabbitmq')
const schemas = require('models/rabbitmq/schemas')
const WorkerStopError = require('error-cat/errors/worker-stop-error')

module.exports.jobSchema = schemas.clusterParentInstanceCreated

/**
 * Cluster created parent-instance event
 * @param {Object} job - Job info
 * @returns {Promise}
 */
module.exports.task = (job) => {
  const log = logger.child({ method: 'ClusterCreatedWorker', job })
  const parsedInstances = job.parsedCompose.results
  const siblingsInstancesDefs = parsedInstances.filter((inst) => {
    return !inst.metadata.isMain
  })
  return Promise.try(() => {
    if (siblingsInstancesDefs.length === 0) {
      throw new WorkerStopError('Job has no siblings instances')
    }
  })
  .then(() => {
    return Promise.map(siblingsInstancesDefs, (parsedComposeSiblingData) => {
      const pickedProps = pick(job, ['cluster', 'sessionUserBigPoppaId', 'organization', 'triggeredAction', 'repoFullName'])
      const newJob = Object.assign({ parsedComposeSiblingData }, pickedProps)
      log.info({ newJob }, 'publish new task to create sibling instance')
      rabbitMQ.createClusterSiblingInstance(newJob)
    })
  })
}
