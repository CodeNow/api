/**
 * Handle `instance.deleted` evenet
 * @module lib/workers/instance.deleted
 */
'use strict'

require('loadenv')()
const DockerComposeClusterService = require('models/services/docker-compose-cluster-service')
const InstanceService = require('models/services/instance-service')
const IsolationService = require('models/services/isolation-service')
const schemas = require('models/rabbitmq/schemas')
const DockerComposeCluster = require('models/mongo/docker-compose-cluster')
const rabbitMQ = require('models/rabbitmq')

module.exports.jobSchema = schemas.instanceChangedSchema


/**
 * Handle instance.deleted. Cleanup addtional resources after instance was deleted.
 * - delete cluster resource if exists
 * - delete isolation if needed
 * - delete forked instances if needed
 * @param {Object} job - Job info
 * @returns {Promise}
 */
module.exports.task = (job) => {
  const instance = job.instance
  return DockerComposeClusterService.findActiveByParentId(job.instance._id)
    .catch(DockerComposeCluster.NotFoundError, function () {
      // ignore this error. That means that there is no cluster
      // for provided instance and nothing else we should do
      return
    })
    .tap(function (cluster) {
      if (cluster) {
        rabbitMQ.deleteCluster({
          id: cluster._id.toString()
        })
      }
    })
    .then(function () {
      if (instance.isolated && instance.isIsolationGroupMaster) {
        return IsolationService.deleteIsolation(instance.isolated)
      }
    })
    .tap(function () {
      return InstanceService.deleteAllInstanceForks(instance)
    }).return(null)
}
