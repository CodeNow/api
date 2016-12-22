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
const rabbitMQ = require('models/rabbitmq')

const AutoIsolationService = module.exports = {}

AutoIsolationService.logger = logger.child({
  module: 'AutoIsolationService'
})

/**
 * Create new AutoIsolationConfig model and emit `auto-isolation-config.created` event
 * @param {Object} props - all valid properties for the new model
 * @return {Promise}
 * @resolves {AutoIsolationConfig} newly created model
 */
AutoIsolationService.createAndEmit = function (props) {
  return AutoIsolationConfig.createAsync(props)
    .tap((autoIsolationConfig) => {
      const id = autoIsolationConfig._id.toString()
      const configCreatedEvent = {
        autoIsolationConfig: { id },
        user: {
          id: props.createdByUser
        },
        organization: {
          id: props.ownedByOrg
        }
      }
      rabbitMQ.autoIsolationConfigCreated(configCreatedEvent)
    })
}

/**
 * Create new AutoIsolationConfig model and emit `auto-isolation-config.created` event
 * @param {Object} sessionUser - sessionUser that initiated creation
 * @param {Object} masterInstance - masterInstance object for the config
 * @param {Array} requestedDependencies - dependencies that should be added to the config.
 * @return {Promise}
 * @resolves {AutoIsolationConfig} newly created model
 */
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
  .then((requestedDependencies) => {
    return AutoIsolationService.createAndEmit({
      instance: masterInstance,
      requestedDependencies,
      createdByUser: sessionUserBigPoppaId,
      ownedByOrg: organization.id
    })
  })
}
