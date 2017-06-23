/**
 * Handle `cluster.cleanup` task
 * @module lib/workers/cluster.cleanup
 */
'use strict'

require('loadenv')()
const logger = require('logger')
const Promise = require('bluebird')
const joi = require('utils/joi')
const Instance = require('models/mongo/instance')
const ClusterDataService = require('models/services/cluster-data-service')
const rabbitMQ = require('models/rabbitmq')
const WorkerStopError = require('error-cat/errors/worker-stop-error')

module.exports.jobSchema = joi.object({
  githubId: joi.number().required(),
  clusterCreateId: joi.string().required(),
  delay: joi.number().required()
}).unknown().required()

/**
 * Cleanup cluster
 * @param {Object} job - Job info
 * @returns {Null}
 */
module.exports.task = (job) => {
  const log = logger.child({
    method: 'ClusterCleanupWorker',
    job
  })

  return Promise.delay(job.delay)
    .then(() => {
      return Instance.findInstancesByClusterUUID(job.githubId, job.clusterCreateId)
    })
    .then(instances => {
      return ClusterDataService.populateInstanceWithClusterInfo(instances)
    })
    .filter(instance => !instance.inputClusterConfig)
    .map(instance => instance._id.toString())
    .each(instanceId => rabbitMQ.deleteInstance({ instanceId }))
    .tap(instancesIds => log.trace({ instancesIds }, 'deleted instances'))
    .catch((err) => {
      throw new WorkerStopError('Something failed trying to cleanup the lost cluster', { err })
    })
}
