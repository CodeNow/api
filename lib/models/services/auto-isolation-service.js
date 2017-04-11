/**
 * @module lib/models/services/auto-isolation-service
 */
'use strict'

require('loadenv')('models/services/infracode-version-service')

const Boom = require('dat-middleware').Boom
const Promise = require('bluebird')
const exists = require('101/exists')
const hasKeypaths = require('101/has-keypaths')
const isString = require('101/is-string')
const keypather = require('keypather')()
const logger = require('logger')

const AutoIsolationConfig = require('models/mongo/auto-isolation-config')
const Instance = require('models/mongo/instance')
const InstanceService = require('models/services/instance-service')
const rabbitMQ = require('models/rabbitmq')
const UserService = require('models/services/user-service')

const AutoIsolationService = module.exports = {}

AutoIsolationService.logger = logger.child({
  module: 'AutoIsolationService'
})

/**
 * Create new AutoIsolationConfig model or updates an existing one by instance
 * and emit `auto-isolation-config.created` event
 *
 * @param {Object} props - all valid properties for the new model
 * @return {Promise}
 * @resolves {AutoIsolationConfig} newly created (or updated) model
 */
AutoIsolationService.createOrUpdateAndEmit = function (props) {
  const log = AutoIsolationService.logger.child({
    method: 'createOrUpdateAndEmit',
    props
  })
  log.trace('called')
  return AutoIsolationConfig.findActiveByInstanceId(props.instance)
    .then(autoIsolationConfig => {
      autoIsolationConfig.set(props)
      return autoIsolationConfig.saveAsync()
    })
    .catch(AutoIsolationConfig.NotFoundError, () => AutoIsolationConfig.createAsync(props))
    .tap(autoIsolationConfig => {
      const id = keypather.get(autoIsolationConfig, '_id.toString()')
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
 * Create new AutoIsolationConfig model (or updates an existing one for the given instance)
 *   and emit `auto-isolation-config.created` event
 *
 * @param {Object} sessionUser - sessionUser that initiated creation
 * @param {String} masterInstanceId - masterInstance id for the config
 * @param {Array} requestedDependencies - dependencies that should be added to the config.
 * @param {Boolean} redeployOnKilled - whether or not we should redeployOnKilled
 * @return {Promise}
 * @resolves {AutoIsolationConfig} newly created model
 */
AutoIsolationService.create = function (sessionUser, masterInstanceId, requestedDependencies, redeployOnKilled) {
  const log = AutoIsolationService.logger.child({
    method: 'create',
    sessionUser,
    masterInstanceId,
    requestedDependencies
  })
  log.trace('called')
  const sessionUserBigPoppaId = keypather.get(sessionUser, 'bigPoppaUser.id')
  return Instance.findByIdAsync(masterInstanceId)
    .then((masterInstance) => {
      if (!masterInstance) { throw Boom.notFound('Instance not found.') }
      const ownerId = keypather.get(masterInstance, 'owner.github')
      return UserService.getBpOrgInfoFromGitHubId(sessionUser, ownerId)
    })
    .then((organization) => {
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
      return {
        requestedDependencies: deps,
        organization
      }
    })
    .then((configuration) => {
      return AutoIsolationService.createOrUpdateAndEmit({
        instance: masterInstanceId,
        requestedDependencies: configuration.requestedDependencies,
        createdByUser: sessionUserBigPoppaId,
        ownedByOrg: configuration.organization.id,
        redeployOnKilled
      })
    })
}

AutoIsolationService.fetchAutoIsolationForInstance = function (instance) {
  return AutoIsolationConfig.findActiveByInstanceId(instance._id)
    .catch(err => {
      if (!instance.masterPod) {
        return AutoIsolationConfig.findActiveByInstanceShortHash(instance.parent)
      }
      throw err
    })
    .tap(aic => {
      if (!aic) {
        throw new AutoIsolationConfig.NotFoundError('Could not find AICs for the given instance', { instance })
      }
    })
}

AutoIsolationService._isMainInstanceConfigOwner = function (mainInstance, autoIsolationConfig) {
  return autoIsolationConfig.instance.toString() === mainInstance._id.toString()
}

/**
 * Fetches all of the instances associated with the given instance under the given autoIsolationConfig
 *
 * @param mainInstance
 * @param autoIsolationConfig
 * @returns {Array}
 */
AutoIsolationService.fetchDependentInstances = function (mainInstance, autoIsolationConfig) {
  const cleanDeps = autoIsolationConfig.requestedDependencies.filter(dep => !!dep.instance)
  return Promise
    .map(cleanDeps, dep => AutoIsolationService.fetchIsolationInstanceModel(dep.instance, mainInstance, autoIsolationConfig))
    .filter(dep => !!dep) // filter out any that are missing
}

AutoIsolationService.fetchIsolationInstanceModel = function (instanceId, mainInstance, autoIsolationConfig) {
  const isSelf = AutoIsolationService._isMainInstanceConfigOwner(mainInstance, autoIsolationConfig)
  return Instance.findInstanceById(instanceId)
    .then(depInstance => {
      if (isSelf) {
        return { instance: depInstance }
      }
      return Instance.findIsolatedChildOfParentInstance(depInstance, mainInstance.isolated)
        .then(childInstance => {
          return {
            instance: childInstance,
            master: depInstance
          }
        })
    })
    .catchReturn(Instance.NotFoundError, null)

}

AutoIsolationService._addMainInstanceModel = function (instanceModels, mainInstance, autoIsolationConfig) {
  const isSelf = AutoIsolationService._isMainInstanceConfigOwner(mainInstance, autoIsolationConfig)
  // Now add the mainInstance
  if (isSelf) {
    return instanceModels.push({ instance: mainInstance })
  }
  return Instance.findInstanceByShortHash(mainInstance.parent)
    .tap(masterInstance => instanceModels.push({
      instance: mainInstance,
      master: masterInstance
    }))
}

/**
 * Fetch the instances that make up the requested dependencies which have an instance id
 *
 * @param {Instance} mainInstance - main instance of the cluster
 * @returns {Promise}
 * @resolve {Instance[]} All the dependent instances of the Isolation Config of the given instance
 */
AutoIsolationService.fetchAutoIsolationDependentInstances = function (mainInstance) {
  const log = AutoIsolationService.logger.child({
    method: 'fetchAutoIsolationDependentInstances',
    mainInstance
  })
  log.trace('called')
  return AutoIsolationService.fetchAutoIsolationForInstance(mainInstance)
    .then(aic => {
      return AutoIsolationService.fetchDependentInstances(mainInstance, aic)
        .tap(instanceModels => AutoIsolationService._addMainInstanceModel(instanceModels, mainInstance, aic))
    })
}
