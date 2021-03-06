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
  log.info('called')
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
    .map(cleanDeps, dep => {
      return Instance.findInstanceById(dep.instance)
        .catchReturn(Instance.NotFoundError, null) // catch the error and return null so we remove it
    })
    .filter(dep => !!dep) // filter out any that are missing
}

/**
 * Fetch the instances that make up the requested dependencies which have an instance id
 *
 * @param {Instance} mainInstance - main instance of the cluster
 *
 * @resolve {Instance[]} All the instances of the Isolation Config of the given instance
 * @private
 */
AutoIsolationService._fetchMasterAutoIsolatedInstances = function (mainInstance) {
  const log = AutoIsolationService.logger.child({
    method: '_fetchMasterAutoIsolatedInstances',
    instanceId: mainInstance._id
  })
  log.info('called')
  return AutoIsolationService.fetchAutoIsolationForInstance(mainInstance._id)
    .then(aic => {
      return AutoIsolationService.fetchDependentInstances(mainInstance, aic)
        .tap(instanceModels => instanceModels.push(mainInstance))
    })
}

/**
 * Fetch the instances that make up the requested dependencies which have an instance id.  If the
 * mainInstance is isolated, just fetch the instances by that
 *
 * @param {Instance}  mainInstance          - main instance of the cluster
 * @param {ObjectId=} mainInstance.isolated - If this instnace is isolated, this is the key to get it
 *
 * @resolve {Object[]} model          - All the dependent instances of the Isolation Config of
 *                                        the given instance
 *          {Instance} model.instance - instance model requested
 */
AutoIsolationService.fetchAutoIsolationDependentInstances = function (mainInstance) {
  const log = AutoIsolationService.logger.child({
    method: 'fetchAutoIsolationDependentInstances',
    instanceId: mainInstance._id
  })
  log.info('called')
  return Promise.try(() => {
    if (mainInstance.isolated) {
      return Instance.fetchIsolatedInstances(mainInstance.isolated)
    }
    return AutoIsolationService._fetchMasterAutoIsolatedInstances(mainInstance)
  })
    .map(instance => { return { instance } })
}

/**
 * Fetch the main instance that owns an autoIsolationConfig
 *
 * @param {AutoIsolationConfig} autoIsolationConfig          - AIC to get the main instance from
 * @param {ObjectId}            autoIsolationConfig.instance - Main instance id
 *
 * @resolve {Instance}   Main instance of the given AIC
 * @throws  {Instance.NotFoundError} When instance lookup failed
 */
AutoIsolationService.fetchMainInstance = function (autoIsolationConfig) {
  const log = AutoIsolationService.logger.child({
    method: '_fetchMasterAutoIsolatedInstances',
    autoIsolationConfig
  })
  log.info('called')
  return Instance.findInstanceById(autoIsolationConfig.instance)
}

