'use strict'

const Promise = require('bluebird')
const mongoose = require('mongoose')

const auditPlugin = require('./audit-plugin')
const BaseSchema = require('../../models/mongo/schemas/base')
const ClusterBuildSchema = require('../../models/mongo/schemas/cluster-build')
const logger = require('../../logger')

const log = logger.child({
  module: 'ClusterBuild'
})

ClusterBuildSchema.plugin(auditPlugin, {
  modelName: 'ClusterBuild'
})

module.exports = class ClusterBuild extends mongoose.model('ClusterBuild', ClusterBuildSchema) {
  /**
   * @param {String} clusterBuildId
   * @param {Object} err
   * @returns {Promise}
   * @resolves {ClusterBuild}
   */
  static setStateToError (clusterBuildId, err) {
    const query = {
      _id: clusterBuildId
    }

    const update = {
      $set: {
        state: 'errored',
        errorMessage: err.message
      }
    }

    return this.findOneAndUpdateAsync(query, update)
  }

  /**
   * @param {String} clusterBuildId
   * @returns {Promise}
   * @resolves {ClusterBuild}
   */
  static setStateToBuilt (clusterBuildId) {
    return ClusterBuild._transitionToNextState(clusterBuildId, 'building', {
      state: 'built'
    })
  }

  /**
   * @param {ClusterBuild} clusterBuild
   * @returns {Promise}
   * @resolves {ClusterBuild}
   */
  static setStateToDeploying (clusterBuild) {
    return ClusterBuild._transitionToNextState(clusterBuild._id, 'built', {
      state: 'deploying',
      specifications: clusterBuild.specifications
    })
  }

  /**
   * @param {String} clusterBuildId
   * @param {String} expectedState
   * @param {Object} nextState
   * @returns {Promise}
   * @resolves {ClusterBuild}
   */
  static _transitionToNextState (clusterBuildId, expectedState, nextState) {
    const transitionQuery = {
      _id: clusterBuildId,
      state: expectedState
    }

    const stateUpdate = {
      $set: nextState
    }

    return this.findOneAndUpdateAsync(transitionQuery, stateUpdate)
      .then((clusterBuild) => {
        if (!clusterBuild) {
          log.error({ transitionQuery }, 'failed to find building clusterBuild')

          return ClusterBuild._determineStateError(clusterBuildId, expectedState)
        }

        return clusterBuild.toJSON()
      })
  }

  /**
   * @param {String} clusterBuildId
   * @param {String} expectedState
   * @returns {Promise}
   * @resolves {ClusterBuild}
   * @rejects {ClusterBuild.NotFoundError}
   * @rejects {ClusterBuild.IncorrectStateError}
   */
  static _determineStateError (clusterBuildId, expectedState) {
    return ClusterBuild.findByIdAsync(clusterBuildId)
      .tap((clusterBuild) => {
        if (!clusterBuild) {
          log.error({ clusterBuildId }, 'failed to find clusterBuild in correct state')

          throw new ClusterBuild.NotFoundError({
            clusterBuildId
          })
        }

        if (clusterBuild.state !== expectedState) {
          throw new ClusterBuild.IncorrectStateError(expectedState, clusterBuild.state)
        }
      })
  }

  static get NotChangedError () {
    return NotChangedError
  }

  static get IncorrectStateError () {
    return IncorrectStateError
  }

  static get NotFoundError () {
    return NotFoundError
  }
}

Promise.promisifyAll(module.exports)
Promise.promisifyAll(module.exports.prototype)

/**
 * Error thrown ClusterBuild failed to create
 * @param {string} opts - data object given to the ClusterBuild creation
 */
const NotChangedError = class extends BaseSchema.NotChangedError {
  constructor (opts) {
    super('ClusterBuild', opts, 'debug')
  }
}

/**
 * Error thrown when clusterBuild is not in the correct state for update
 * @param {string} expectedStatus expected status of clusterBuild
 * @param {string} actualStatus   status of clusterBuild
 */
const IncorrectStateError = class extends BaseSchema.IncorrectStateError {
  constructor (expectedStatus, actualStatus) {
    super('ClusterBuild', expectedStatus, actualStatus, 'critical')
  }
}

/**
 * Error thrown instance is not in the expected state
 * @param {string} expectedStatus expected status of instance
 * @param {Object} instance       instance object
 * @param {Object} reporting      reporting options
 */
const NotFoundError = class extends BaseSchema.NotFoundError {
  constructor (query, level) {
    super('ClusterBuild', query, level || 'critical')
  }
}
