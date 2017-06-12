/**
 * @module lib/models/services/deployment-service
 */
'use strict'

const objectId = require('objectid')
const logger = require('logger')
const Deployment = require('models/mongo/deployment')

function DeploymentService () {}

DeploymentService.logger = logger.child({
  module: 'DeploymentService'
})

module.exports = DeploymentService

DeploymentService.create = function (userId, orgId, triggeredAction, triggeredInfo) {
  const log = DeploymentService.logger.child({
    method: 'create'
  })
  log.info('called')
  return Deployment.createAsync({
    state: 'created',
    triggeredAction,
    createdByUser: userId,
    ownedByOrg: orgId,
    triggeredInfo
  })
}

DeploymentService.findActiveById = function (state, id) {
  const log = DeploymentService.logger.child({
    method: 'create'
  })
  log.info('findActiveById')
  return DeploymentService.findOneActive({
    _id: objectId(id),
    state: state
  })
}
