'use strict'
require('loadenv')('models/services/cluster-data-service')

const keypather = require('keypather')()
const Promise = require('bluebird')
const find = require('101/find')
const pluck = require('101/pluck')
const hasProps = require('101/has-properties')

const AutoIsolationConfig = require('models/mongo/auto-isolation-config')
const InputClusterConfig = require('models/mongo/input-cluster-config')
const Instance = require('models/mongo/instance')

const logger = require('logger')
const UserService = require('models/services/user-service')
const OrganizationNotFoundError = require('errors').OrganizationNotFoundError

module.exports = class ClusterDataService {
  static get log () {
    return logger.child({
      module: 'ClusterDataService'
    })
  }

  /**
   * Merge together `cluster` data with `masterInstanceId` property comming from `autoIsolationConfig`.
   * @param {InputClusterConfig} cluster              - InputClusterConfig model
   * @param {AutoIsolationConfig} autoIsolationConfig - AutoIsolationConfig model
   */
  static makeClusterData (cluster, autoIsolationConfig) {
    const masterInstanceId = keypather.get(autoIsolationConfig, 'instance.toString()')
    const clusterConfigData = Object.assign({}, cluster.toJSON(), {
      masterInstanceId
    })
    return clusterConfigData
  }

  static findInstanceIdByShortHash (shortHash) {
    return Instance.findOneByShortHashAsync(shortHash)
      .then(function (instance) {
        return keypather.get(instance, '_id.toString()')
      })
  }
  /**
   * Populate instance (if possible) with corresponding `inputClusterConfig` object.
   * `inputClusterConfig` will have `InputClusterConfig` data and `masterInstanceId` for that cluster.
   * This function modifies input `instance`
   * @param {Array} instances - array of instances
   * @return {Promise}
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
      return ClusterDataService.findInstanceIdByShortHash(instanceParentShortHash)
    })
    .then((instanceLookupId) => {
      if (!instanceLookupId) {
        return
      }
      return AutoIsolationConfig.findActiveByAnyInstanceId(instanceLookupId)
        .then((aig) => {
          log.trace({ aig }, 'found autoisolation config')
          return InputClusterConfig.findActiveByAutoIsolationId(aig._id.toString())
            .then((cluster) => {
              log.trace({ cluster }, 'found cluster data for AutoIsolationConfig')
              const clusterConfigData = ClusterDataService.makeClusterData(cluster, aig)
              instance._doc.inputClusterConfig = clusterConfigData
              return instance
            })
        })
    })
    .catch(Error, (err) => {
      log.error({ err }, 'could not populate instance with cluster data')
    })
  }

  /**
   * Populate each instance (if possible) with corresponding `inputClusterConfig` object.
   * `inputClusterConfig` will have `InputClusterConfig` data and `masterInstanceId` for that cluster.
   * This function modifies input `instances`
   * @param {Array} instances - array of instances
   * @param {Object} sessionUser - session user
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
      if (!instances || instances.length === 0 || !sessionUser) {
        return
      }
      const instancesShortHashesToIds = {}
      instances.forEach((instance) => {
        instancesShortHashesToIds[instance.shortHash] = instance._id.toString()
      })
      const ownerGitHubId = keypather.get(instances, '[0].owner.github')
      const organization = UserService.getBpOrgInfoFromGitHubId(sessionUser, ownerGitHubId)
      log.trace({ organization }, 'organization found')
      // find all active AutoIsolationConfigs for the org
      return AutoIsolationConfig.findAsync({
        ownedByOrg: organization.id,
        deleted: {
          $exists: false
        }
      })
      .then((aiConfigs) => {
        log.trace({
          ids: aiConfigs.map(pluck('_id'))
        }, 'found AutoIsolationConfigs')
        const instancesByAig = {}
        aiConfigs.forEach(function (aig) {
          instancesByAig[aig.instance] = aig
          aig.requestedDependencies.forEach(function (dep) {
            if (dep && dep.instance) {
              instancesByAig[dep.instance] = aig
            }
          })
        })
        // fetch all active InputClusterConfig using fetched AutoIsolationConfigs
        const aiConfigsIds = aiConfigs.map(pluck('_id'))
        return InputClusterConfig.findAsync({
          autoIsolationConfigId: { $in: aiConfigsIds },
          deleted: {
            $exists: false
          }
        })
        .then((clusters) => {
          log.trace({
            ids: clusters.map(pluck('_id'))
          }, 'found InputClusterConfigs')
          instances.forEach(function (instance) {
            const instanceId = keypather.get(instance, '_id.toString()')
            const instanceName = keypather.get(instance, 'name')
            // if instance isolated take parent
            return Promise.try(() => {
              if (!instance.isolated) {
                return instanceId
              }
              const instanceParentShortHash = keypather.get(instance, 'parent.toString()')
              const instanceLookupId = instancesShortHashesToIds[instanceParentShortHash]
              log.trace({
                instanceName,
                instanceId,
                instanceLookupId,
                instanceParentShortHash,
                instancesShortHashesToIds
              }, 'lookup parent instance by shortHash')
              if (instanceLookupId) {
                return instanceLookupId
              }
              // this only happens when `instances` is an array with one instance and we couldn't lookup masterId
              log.trace({
                instanceName,
                instanceId,
                instanceParentShortHash,
                instancesShortHashesToIds
              }, 'fetch instance by parent short hash')
              return ClusterDataService.findInstanceIdByShortHash(instanceParentShortHash)
            })
            .then((instanceLookupId) => {
              const aig = instancesByAig[instanceLookupId]
              log.trace({
                aig,
                instanceName,
                instanceId,
                instanceLookupId
              }, 'found aig for instance')
              if (aig) {
                const cluster = find(clusters, hasProps({ autoIsolationConfigId: aig._id }))
                if (cluster) {
                  const clusterConfigData = ClusterDataService.makeClusterData(cluster, aig)
                  log.trace({
                    instanceId,
                    instanceName,
                    clusterConfigData
                  }, 'adding cluster config data to the instance')
                  instance._doc.inputClusterConfig = clusterConfigData
                } else {
                  log.trace({
                    aig, 
                    clusters
                  }, 'not found cluster by autoIsolationConfig')
                }
              }
            })
          })
          return instances
        })
      })
    })
    .catch(OrganizationNotFoundError, function (err) {
      log.error({ err }, 'organization not found')
    })
    .catch(Error, (err) => {
      log.error({ err }, 'could not populate instances with cluster data')
    })
  }
}
