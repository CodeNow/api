/**
 * @module lib/models/services/auto-isolation-service
 */
'use strict'

require('loadenv')('models/services/infracode-version-service')

const Boom = require('dat-middleware').Boom
const isString = require('101/is-string')
const keypather = require('keypather')
const logger = require('logger')
const Promise = require('bluebird')

const AutoIsolationConfig = require('models/mongo/auto-isolation-config')
const UserService = require('models/services/user-service')

const AutoIsolationService = module.exports = {}

AutoIsolationService.logger = logger.child({
  module: 'AutoIsolationService'
})

AutoIsolationService.create = function (sessionUser, masterInstance, requestedDependencies) {
  const sessionUserBigPoppaId = keypather.get(sessionUser, 'bigPoppaUser.id')
  const ownerId = keypather.get(masterInstance, 'owner.github')
  const organization = UserService.getBpOrgInfoFromGitHubId(sessionUser, ownerId)
  return Promise.try(() => {
    const deps = requestedDependencies.map(function (d) {
      if (d.instance) {
        if (!isString(d.instance)) {
          throw Boom.badRequest('instance must be a string')
        }
        if (d.repo || d.branch || d.org) {
          throw Boom.badRequest('repo, branch, and org cannot be defined with instance')
        }
        return { instance: d.instance.toLowerCase() }
      } else {
        if (!isString(d.repo) || !isString(d.branch) || !isString(d.org)) {
          throw Boom.badRequest('repo, branch, and org must be defined for each dependency')
        }
        return {
          repo: d.repo.toLowerCase(),
          branch: d.branch.toLowerCase(),
          org: d.org.toLowerCase()
        }
      }
    })
    return deps
  })
  .then((deps) => {
    const aic = new AutoIsolationConfig({
      instance: masterInstance,
      requestedDependencies: deps,
      createdByUser: sessionUserBigPoppaId,
      ownedByOrg: organization.id
    })
    return aic.saveAsync()
  })
}
