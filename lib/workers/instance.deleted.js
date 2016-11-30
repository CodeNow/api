/**
 * Handle `instance.deleted` evenet
 * @module lib/workers/instance.deleted
 */
'use strict'

require('loadenv')()
const Promise = require('bluebird')
const DockerComposeCluster = require('models/mongo/docker-compose-cluster')
const InstanceService = require('models/services/instance-service')
const IsolationService = require('models/services/isolation-service')
const logger = require('logger').child({ module: 'InstanceDeleted' })
const rabbitMQ = require('models/rabbitmq')
const schemas = require('models/rabbitmq/schemas')

module.exports = {
  jobSchema: schemas.instanceChangedSchema,

  _deleteCluster (job) {
    const instanceId = job.instance._id
    const log = logger.child({
      method: '_deleteCluster',
      instanceId
    })
    log.info('called')
    return DockerComposeCluster.findActiveByParentId(job.instance._id)
      .catch(DockerComposeCluster.NotFoundError, function () {
        // ignore this error. That means that there is no cluster
        // for provided instance and nothing else we should do
        log.info('ignore cluster deletion since instance is not a master for the cluster')
        return
      })
      .tap(function (cluster) {
        if (cluster) {
          const id = cluster._id.toString()
          rabbitMQ.deleteCluster({ cluster: { id } })
        }
      })
  },

  _deleteIsolation (job) {
    const instance = job.instance
    if (instance.isolated && instance.isIsolationGroupMaster) {
      return IsolationService.deleteIsolatedChildren(instance.isolated)
    }
    return Promise.resolve()
  },

  _deleteForks (job) {
    const instance = job.instance
    return InstanceService.deleteAllInstanceForks(instance)
  },

  /**
   * Handle instance.deleted. Cleanup addtional resources after instance was deleted.
   * - delete cluster resource if exists
   * - delete isolation if needed
   * - delete forked instances if needed
   * @param {Object} job - Job info
   * @returns {Promise}
   */
  task (job) {
    return Promise.all([
      this._deleteCluster(job),
      this._deleteIsolation(job),
      this._deleteForks(job)
    ]).return(null)
  }
}
