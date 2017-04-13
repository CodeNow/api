/**
 * @module lib/models/services/auto-isolation-service
 */
'use strict'

require('loadenv')('models/services/infracode-version-service')

const Boom = require('dat-middleware').Boom
const Promise = require('bluebird')
const isString = require('101/is-string')
const keypather = require('keypather')()
const logger = require('logger')

const AutoIsolationConfig = require('models/mongo/auto-isolation-config')
const Instance = require('models/mongo/instance')
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
          id: autoIsolationConfig.createdByUser
        },
        organization: {
          id: autoIsolationConfig.ownedByOrg
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

/**
 * Fetches either the given instance's autoIsolation, or it's parent's
 *
 * @param {ObjectId} instanceId
 *
 * @resolves {AutoIsolationConfig} AIC that govern's the given instance
 */
AutoIsolationService.fetchAutoIsolationForInstance = function (instanceId) {
  return AutoIsolationConfig.findActiveByInstanceId(instanceId)
    .catch(AutoIsolationConfig.NotFoundError, () => {
      // if the instance itself doesn't have an AIC, check it's parent
      return Instance.findParentByChildId(instanceId)
        .then(parent => {
          return AutoIsolationConfig.findActiveByInstanceId(parent._id)
        })
    })
}

/**
 * Simply checks if a given instance is the direct owner of the given config.  When a branch uses
 * its parent's config, this returns false
 *
 * @param {Instance}            mainInstance
 * @param {AutoIsolationConfig} autoIsolationConfig
 *
 * @returns {Boolean} True if the instance is the owner of the given config
 * @private
 */
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

/**
 * Fetches the instance that belongs to the isolation owned by the mainInstance.  If the instance
 * owns the config, we just return it.  If it's a child, then we send it and its parent
 *
 * @param {ObjectId}            instanceId          - Id of the 'requested dependency' for the cluster
 * @param {Instance}            mainInstance        - Head of this cluster, may not be owner of the AIC
 * @param {AutoIsolationConfig} autoIsolationConfig - Config that controls this isolation
 *
 * @resolves {Object}    instanceModel          - Model containing the instance, and possibly the master of it
 *           {Instance}  instanceModel.instance - The requested instance
 *           {Instance=} instanceModel.master   - MasterPod Instance of the requested instance
 */
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

/**
 * Adds the mainInstanceModel to the list of instance models, and adds the master to the model if it
 * isn't the owner of the config
 * @param {Object[]}            instanceModels          - Array of all the instances in this cluster, in models
 * @param {Instance}            instanceModels.instance - Instance in the config
 * @param {Instance=}           instanceModels.master   - MasterPod Instance the former instance relates to
 * @param {Instance}            mainInstance            - Head of this cluster, may not be owner of the AIC
 * @param {AutoIsolationConfig} autoIsolationConfig     - Config that controls this isolation
 *
 * @resolves {Object}    instanceModel          - Model containing the instance, and possibly the master of it
 *           {Instance}  instanceModel.instance - mainInstance
 *           {Instance=} instanceModel.master   - MasterPod Instance of the mainInstance
 * @private
 */
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
 *
 * @resolve {Instance[]} All the dependent instances of the Isolation Config of the given instance
 */
AutoIsolationService.fetchAutoIsolationDependentInstances = function (mainInstance) {
  const log = AutoIsolationService.logger.child({
    method: 'fetchAutoIsolationDependentInstances',
    mainInstance
  })
  log.trace('called')
  return AutoIsolationService.fetchAutoIsolationForInstance(mainInstance._id)
    .then(aic => {
      return AutoIsolationService.fetchDependentInstances(mainInstance, aic)
        .tap(instanceModels => AutoIsolationService._addMainInstanceModel(instanceModels, mainInstance, aic))
    })
}
