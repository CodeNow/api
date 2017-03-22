'use strict'
require('loadenv')('models/services/cluster-data-service')

const keypather = require('keypather')()
const Promise = require('bluebird')
const find = require('101/find')
const pluck = require('101/pluck')
const hasProps = require('101/has-properties')

const AutoIsolationConfig = require('models/mongo/auto-isolation-config')
const InputClusterConfig = require('models/mongo/input-cluster-config')

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
      instances: instances.map(function (instance) {
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
      .then(function (aiConfigs) {
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
            const aig = instancesByAig[instance._id.toString()]
            log.trace({
              aig,
              instanceId: instance._id.toString()
            }, 'find aig for instance')
            if (aig) {
              const cluster = find(clusters, hasProps({ autoIsolationConfigId: aig._id }))
              if (cluster) {
                const clusterConfigData = Object.assign({}, cluster.toJSON(), {
                  masterInstanceId: aig.instance
                })
                log.trace({
                  clusterConfigData
                }, 'adding cluster config data to the instance')
                instance._doc.inputClusterConfig = clusterConfigData
              }
            }
          })
          return instances
        })
      })
      .catch(OrganizationNotFoundError, function (err) {
        log.error({ err }, 'organization not found')
      })
    })
  }
}
