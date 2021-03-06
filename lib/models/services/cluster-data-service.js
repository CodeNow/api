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

  /**
   * Sets the inputClusterConfig on the instance model. This sometimes is hard because _doc
   * @param instance
   * @param cluster
   * @private
   */
  static _setClusterOnInstance (instance, cluster) {
    instance._doc.inputClusterConfig = cluster
  }

  /**
   * Given all instances for an org, and a dictionary of InputClusterConfigs mapped by instance ids,
   * attach either the instance's or the instance's parent's ICC to the model
   *
   * @param {Object<InputClusterConfig>} iccsByInstanceId - Dictionary of iccs indexed by instanceId
   *                                                        (including dep instances)
   * @param {Instance[]}                 instances        - Requested instances
   * @param {String}                     instances.parent - Parent shortHash
   * @param {Instance[]}                 parentInstances  - The requested instances parents
   *
   * @returns {Object<InputClusterConfig>} iccsByInstanceId
   * @private
   */
  static _setClustersOnAllInstances (iccsByInstanceId, instances, parentInstances) {
    const parentsByCid = parentInstances.reduce(_reduceSomethingBy('contextVersion.context.toString()'), {})
    instances.forEach(instance => {
      const contextId = instance.contextVersion.context.toString()
      const instanceId = instance._id.toString()
      const parentInstanceId = keypather.get(parentsByCid[contextId], '_id.toString()')

      // first check if the instance itself has one, otherwise use the parent's
      const instanceIcc = iccsByInstanceId[instanceId] || iccsByInstanceId[parentInstanceId]
      this._setClusterOnInstance(instance, instanceIcc)
    })
    return iccsByInstanceId
  }
  /**
   * Given an organizations bigPoppa Id, find all of the InputClusterConfigs and AutoIsolationConfigs,
   * attach them together (with the masterInstanceId) to the ICCs, and return them
   *
   * @param {AutoIsolationConfig[]} configs     - Array of AICs to fetch the ICCs for and process
   * @param {ObjectId}              configs._id - AutoIsolationConfig id (used to connect icc & aic)
   *
   * @resolves {InputClusterConfig[]} All ICCs related to this org toJSONed with autoIsolationConfigs
   *                                    and masterInstanceId attached
   */
  static fetchInputClusterConfigsByAutoIsolationConfigs (configs) {
    const configsById = configs.reduce(_reduceSomethingBy('_id.toString()'), {})
    const autoIsolationConfigIds = Object.keys(configsById)
    const log = ClusterDataService.log.child({
      method: 'fetchClustersWithIsolationInfoByOrg',
      autoIsolationConfigIds
    })
    log.info('called')
    // fetch all active InputClusterConfig using fetched AutoIsolationConfigs
    return InputClusterConfig.findAllActive({
      autoIsolationConfigId: { $in: autoIsolationConfigIds.map(objectId) }
    })
      .tap(iccs => log.trace({ids: iccs.map(pluck('_id'))}, 'found InputClusterConfigs'))
      .map(icc => icc.toJSON())  // map to json because Mongoose is the worst
      .map(icc => {
        const autoIsolation = configsById[icc.autoIsolationConfigId.toString()]
        return Object.assign(icc, {
          masterInstanceId: autoIsolation.instance.toString(),
          autoIsolation
        })
      })
  }

  /**
   * Takes a populated icc model, and attaches it to the given map by the instanceIds of the instances
   * involved.  This is super useful in a .reduce()
   *
   * @param {Object<InputClusterConfig>} iccsByInstanceId     - A map of input cluster configs by instance
   *                                                             ids
   * @param {InputClusterConfig}         icc                  - A toJSONed InputClusterConfig model to map
   * @param {String}                     icc.masterInstanceId - The instance associated with the icc
   * @param {AutoIsolationConfig}        icc.autoIsolation    - The AutoIsolationConfig model for the icc
   *
   * @returns {Object<InputClusterConfig>} iccsByInstanceId - returns the map for reduce
   * @private
   */
  static _mapIccsByInstanceId (iccsByInstanceId, icc) {
    const aiConfig = icc.autoIsolation
    iccsByInstanceId[icc.masterInstanceId] = icc
    aiConfig.requestedDependencies
      .filter(dep => dep && dep.instance) // filter out all deps without instance on them (before compose)
      .reduce((iccsByInstanceId, dep) => {
        iccsByInstanceId[dep.instance.toString()] = icc // saves the icc under each dependency's id
        return iccsByInstanceId
      }, iccsByInstanceId)
    return iccsByInstanceId
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
      .then(instanceId => AutoIsolationConfig.findActiveByAnyInstanceId(instanceId))
      .then(config => this.fetchInputClusterConfigsByAutoIsolationConfigs([config]))
      .get('0') // because fetchInputClusterConfigsByAutoIsolationConfigs returns an array
      .then(cluster => this._setClusterOnInstance(instance, cluster))
      .catch(err => {
        // We don't want to rethrow error at least for now. UI will degrade but still could work
        log.warn({ err }, 'could not populate instance with cluster data')
      })
      .return(instance)
  }

  /**
   * Populate each instance (if possible) with corresponding `inputClusterConfig` object.
   * `inputClusterConfig` will have `InputClusterConfig` data and `masterInstanceId` for that cluster.
   * This function modifies input `instances`
   * @param {Array} instances - array of instances
   * @return {Promise}
   */
  static populateInstancesWithClusterInfo (instances) {
    const log = ClusterDataService.log.child({
      method: 'populateInstancesWithClusterInfo'
    })
    log.info('called')
    return Promise.try(() => {
      if (!instances || !instances.length) {
        throw new Error('Instances were empty')
      }
      return Instance.fetchParentInstances(instances)
    })
      .then(parentInstances => {
        const instanceIds = parentInstances.concat(instances).map(pluck('_id'))
        log.info({ instanceIds }, 'Working with these instances')

        return AutoIsolationConfig.findActiveByAnyInstanceIds(instanceIds)
          .then(configs => this.fetchInputClusterConfigsByAutoIsolationConfigs(configs))
          .reduce((iccsByInstanceId, icc) => this._mapIccsByInstanceId(iccsByInstanceId, icc), {})
          .then(iccsByInstanceId => this._setClustersOnAllInstances(iccsByInstanceId, instances, parentInstances))
      })
      .catch(err => {
        // We don't want to rethrow error at least for now. UI will degrade but still could work
        log.error({err}, 'could not populate instances with cluster data')
      })
      .return(instances)
  }
}
