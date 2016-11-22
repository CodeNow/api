'use strict'
require('loadenv')('models/services/docker-compose-cluster-service')

const logger = require('logger')
const DockerComposeCluster = require('models/mongo/docker-compose-cluster')
const rabbitMQ = require('models/rabbitmq')

const DockerComposeClusterService = module.exports = {

  log: logger.child({
    module: 'DockerComposeClusterService'
  }),

  delete: function (parentInstanceId) {
    const log = DockerComposeClusterService.log.child({
      method: 'delete',
      instanceId: parentInstanceId
    })
    log.info('DockerComposeClusterService.delete called')
    return DockerComposeCluster.findActive(parentInstanceId)
      .tap(function (cluster) {
        const siblingsIds = cluster.siblingsInstanceIds || []
        siblingsIds.forEach(function (instanceId) {
          rabbitMQ.deleteInstance({ instanceId })
        })
      })
      .tap(function (cluster) {
        return DockerComposeCluster.markAsDeleted()
      })
  }
}
