/**
 * Handle `cluster.cleanup` task
 * @module lib/workers/cluster.cleanup
 */
'use strict'

require('loadenv')()
const Promise = require('bluebird')
const logger = require('logger')
const joi = require('utils/joi')
const Instance = require('models/mongo/instance')
const ClusterDataService = require('models/services/cluster-data-service')
const rabbitMQ = require('models/rabbitmq')
const WorkerStopError = require('error-cat/errors/worker-stop-error')

module.exports.jobSchema = joi.object({
  githubId: joi.number().required(),
  clusterCreateId: joi.string().required()
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
  return Promise.delay(5000)
    .then(() => Instance.findInstancesByClusterUUID(job.githubId, job.clusterCreateId))
    .then(instances => {
      const clusterInstances = instances.filter((instance) => {
        return instance.name === job.clusterName + '-' + instance.shortName
      })
      return ClusterDataService.populateInstanceWithClusterInfo(clusterInstances)
    })
    .filter(instance => !instance.inputClusterConfig)
    .map(instance => instance._id.toString())
    .each(instanceId => rabbitMQ.deleteInstance({ instanceId }))
    .tap(instancesIds => log.trace({ instancesIds }, 'deleted instances'))
    .catch((err) => {
      throw new WorkerStopError('Something failed trying to cleanup the lost cluster', { err })
    })
}
