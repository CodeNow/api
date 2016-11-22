'use strict'
require('loadenv')('models/services/docker-compose-cluster-service')

const logger = require('logger')
const DockerComposeCluster = require('models/mongo/docker-compose-cluster')
const rabbitMQ = require('models/rabbitmq')

const DockerComposeClusterService = module.exports = {

  log: logger.child({
    module: 'DockerComposeClusterService'
  }),

  /**
   * Delete Docker Compose Cluster:
   * - do not delete parentInstance
   * - create job to delete each sibling instance
   * - mark cluster as deleted
   * - emit docker-compose.cluster.deleted
   * @param {ObjectId} parentInstanceId - parent instance id
   */
  delete: function (parentInstanceId) {
    const log = DockerComposeClusterService.log.child({
      method: 'delete',
      instanceId: parentInstanceId
    })
    log.info('DockerComposeClusterService.delete called')
    return DockerComposeCluster.findActiveByParentId(parentInstanceId)
      .tap(function (cluster) {
        const siblingsIds = cluster.siblingsInstanceIds || []
        siblingsIds.forEach(function (instanceId) {
          rabbitMQ.deleteInstance({ instanceId })
        })
      })
      .tap(function (cluster) {
        return DockerComposeCluster.markAsDeleted()
      })
      .then(function (cluster) {
        const clusterId = cluster._id.toString
        rabbitMQ.publishClusterDelete({ clusterId })
      })
  }
}
