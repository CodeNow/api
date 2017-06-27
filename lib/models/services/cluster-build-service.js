'use strict'

const objectId = require('objectid')
const logger = require('logger')
const ClusterBuild = require('models/mongo/cluster-build')

function ClusterBuildService () {}

ClusterBuildService.logger = logger.child({
  module: 'ClusterBuildService'
})

module.exports = ClusterBuildService

/**
 * Create new `ClusterBuild` record
 * @param {Number} userId - bpId of the user who triggered ClusterBuild
 * @param {Number} orgId - bpId of the organization who owns infrastructure
 * @param {Object} triggeredInfo - action, repo, branch and commit
 * @resolves {Promise} with saved record
 */
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

/**
 * Find cluster build by unique id and `state`
 * @param {String} id - cluster build id
 * @param {String} state - state of the cluster build which we assert on
 * @resolves {Promise} with found record
 */
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
