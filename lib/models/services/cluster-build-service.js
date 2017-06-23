'use strict'

const objectId = require('objectid')
const logger = require('logger')
const ClusterBuild = require('models/mongo/cluster-build')

function ClusterBuildService () {}

ClusterBuildService.logger = logger.child({
  module: 'ClusterBuildService'
})

module.exports = ClusterBuildService

ClusterBuildService.create = function (userId, orgId, triggeredInfo) {
  const log = ClusterBuildService.logger.child({
    method: 'create',
    userId, orgId, triggeredInfo
  })
  log.info('called')
  const initialData = {
    state: 'created',
    createdByUser: userId,
    ownedByOrg: orgId,
    triggeredInfo
  }
  return ClusterBuild.createAsync(initialData)
}

ClusterBuildService.findActiveByIdAndState = function (id, state) {
  const log = ClusterBuildService.logger.child({
    method: 'findActiveById',
    id, state
  })
  log.info('called')
  return ClusterBuild.findOneActive({
    _id: objectId(id),
    state
  })
}
