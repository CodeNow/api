/**
 * @module lib/models/services/deployment-service
 */
'use strict'

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
