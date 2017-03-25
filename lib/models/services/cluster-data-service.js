'use strict'
require('loadenv')('models/services/cluster-data-service')

const keypather = require('keypather')()
const Promise = require('bluebird')
const pluck = require('101/pluck')

const AutoIsolationConfig = require('models/mongo/auto-isolation-config')
const InputClusterConfig = require('models/mongo/input-cluster-config')
const Instance = require('models/mongo/instance')
const objectId = require('objectid')

const logger = require('logger')
const UserService = require('models/services/user-service')

/**
 * Use this to reduce stuff into a sweet dictionary indexed by whatever path
 *
 * @param {String} path - keypather-ed path to the index
 *
 * @returns {Function} a reduce function
 * @private
 */
function _reduceSomethingBy (path) {
  return (map, item) => {
    map[keypather.get(item, path)] = item
    return map
  }
}

module.exports = class ClusterDataService {
  static get log () {
    return logger.child({
      module: 'ClusterDataService'
    })
  }

  static setClusterOnInstance (instance, cluster) {
    const log = ClusterDataService.log.child({
      method: 'setClusterOnInstance',
      instance, cluster
    })
    log.info('called')
    // then check if the parent is part of one
    instance._doc.inputClusterConfig = cluster
  }

  /**
   * Given an organizations bigPoppa Id, find all of the InputClusterConfigs and AutoIsolationConfigs,
   * attach them together (with the masterInstanceId) to the ICCs, and return them
   *
   * @param {AutoIsolationConfig[]} configs - Array of AICs to fetch the ICCs for and process
   *
   * @resolves {InputClusterConfig[]} All ICCs related to this org, with autoIsolationConfigs attached
   */
  static fetchInputClusterConfigsByAutoIsolationConfigs (configs) {
    const configsById = configs.reduce(_reduceSomethingBy('_id'), {})
    const autoIsolationConfigIds = Object.keys(configsById).map(objectId)
    const log = ClusterDataService.log.child({
      method: 'fetchClustersWithIsolationInfoByOrg',
      autoIsolationConfigIds
    })
    log.info('called')
    // fetch all active InputClusterConfig using fetched AutoIsolationConfigs
    return InputClusterConfig.findAllActive({
      autoIsolationConfigId: { $in: autoIsolationConfigIds }
    })
      .tap(iccs => log.trace({ids: iccs.map(pluck('_id'))}, 'found InputClusterConfigs'))
      .each(icc => {
        const aiConfig = configsById[icc.autoIsolationConfigId.toString()]
        if (aiConfig) {
          icc._doc.masterInstanceId = keypather.get(aiConfig, 'instance.toString()')
          icc._doc.autoIsolation = aiConfig
        }
      })
  }

  /**
   * Takes a populated icc model, and attaches it to the given map by the instanceIds of the instances
   * involved.  This is super useful in a .reduce()
   *
   * @param {Object<InputClusterConfig>} iccsByInstanceId - A map of input cluster configs by instance
   *                                                        ids
   * @param {InputClusterConfig}         icc              - A config to map
   * @returns {Object<InputClusterConfig>} iccsByInstanceId - returns the map for reduce
   * @private
   */
  static _mapIccsToInstanceId (iccsByInstanceId, icc) {
    const aiConfig = icc._doc.autoIsolation
    iccsByInstanceId[aiConfig.instance.toString()] = icc
    return aiConfig.requestedDependencies
      .filter(dep => dep && dep.instance) // filter out all deps without instance on them (before compose)
      .reduce(_reduceSomethingBy('instance.toString()'), iccsByInstanceId)
  }

  /**
   * Populate instance (if possible) with corresponding `inputClusterConfig` object.
   * `inputClusterConfig` will have `InputClusterConfig` data and `masterInstanceId` for that cluster.
   * This function modifies input `instance`
   * @param {Instance} instance - Instance model to populate
   *
   * @resolves {
   */
  static populateInstanceWithClusterInfo (instance) {
    const instanceId = keypather.get(instance, '_id.toString()')
    const instanceParentShortHash = keypather.get(instance, 'parent.toString()')
    // if instance isolated take parent
    const log = ClusterDataService.log.child({
      method: 'populateInstanceWithClusterInfo',
      instanceId,
      instanceParentShortHash
    })
    log.info('called')
    return Promise.try(() => {
      if (!instance.isolated) {
        return instanceId
      }
      return Instance.findInstanceIdByShortHash(instanceParentShortHash)
    })
      .then((instanceLookupId) => {
        if (!instanceLookupId) {
          return instance
        }
        return AutoIsolationConfig.findActiveByAnyInstanceId(instanceLookupId)
          .then(config => this.fetchInputClusterConfigsByAutoIsolationConfigs([config]))
          .get('0')
          .then(cluster => this.setClusterOnInstance(instance, cluster))
      })
      .catch((err) => {
        // We don't want to rethrow error at least for now. UI will degrade but still could work
        log.error({err}, 'could not populate instance with cluster data')
      })
      .return(instance)
  }

  /**
   * Populate each instance (if possible) with corresponding `inputClusterConfig` object.
   * `inputClusterConfig` will have `InputClusterConfig` data and `masterInstanceId` for that cluster.
   * This function modifies input `instances`
   * @param {Array} instances - array of instances
   * @param {SessionUser} sessionUser - session user
   * @return {Promise}
   */
  static populateInstancesWithClusterInfo (instances, sessionUser) {
    const log = ClusterDataService.log.child({
      method: 'populateInstancesWithClusterInfo',
      instances: (instances || []).map(function (instance) {
        return {
          instanceId: keypather.get(instance, '_id'),
          instanceName: keypather.get(instance, 'name'),
          ownerGitHubId: keypather.get(instance, 'owner.github')
        }
      }),
      sessionUser
    })
    log.info('called')
    return Promise.try(() => {
      if (!instances || !instances.length || !sessionUser) {
        throw new Error('Instances or sessionUser were empty')
      }
      const ownerGitHubId = keypather.get(instances, '[0].owner.github')
      const organization = UserService.getBpOrgInfoFromGitHubId(sessionUser, ownerGitHubId)

      log.trace({organization}, 'organization found')

      // find all active AutoIsolationConfigs for the org
      return AutoIsolationConfig.findAllActive({
        ownedByOrg: organization.id
      })
    })
      .then(configs => this.fetchInputClusterConfigsByAutoIsolationConfigs(configs))
      .reduce((iccsByInstanceId, icc) => this._mapIccsToInstanceId(iccsByInstanceId, icc), {})
      .then(iccsByInstanceId => {
        const shortsToIds = instances.reduce(_reduceSomethingBy('shortHash'), {})
        instances.forEach(instance => {
          const instanceId = instance._id.toString()
          const parentInstanceId = shortsToIds[instance.parent]

          // first check if the instance itself has one
          const instanceIcc = iccsByInstanceId[instanceId] || iccsByInstanceId[parentInstanceId]
          this.setClusterOnInstance(instance, instanceIcc)
        })
      })
      .catch((err) => {
        // We don't want to rethrow error at least for now. UI will degrade but still could work
        log.error({err}, 'could not populate instances with cluster data')
      })
      .return(instances)
      .tap(instances => log.trace({instances}, 'result of attaching cluster data to instances'))
  }
}
