'use strict'

const Promise = require('bluebird')
const mongoose = require('mongoose')

const auditPlugin = require('./audit-plugin')
const BaseSchema = require('../../models/mongo/schemas/base')
const DeploymentSchema = require('../../models/mongo/schemas/deployment')
const logger = require('../../logger')

const log = logger.child({
  module: 'Deployment'
})

DeploymentSchema.plugin(auditPlugin, {
  modelName: 'Deployment'
})

module.exports = class Deployment extends mongoose.model('Deployment', DeploymentSchema) {
  /**
   * @param {String} deploymentId
   * @returns {Promise}
   * @resolves {Deployment}
   */
  static setStateToDeploying (deploymentId) {
    return Deployment._transitionToNextState(deploymentId, 'building', 'deploying')
  }

  /**
   *
   * @param {String} deploymentId
   * @param {String} expectedState
   * @param {String} nextState
   * @returns {Promise}
   * @resolves {Deployment}
   */
  static _transitionToNextState (deploymentId, expectedState, nextState) {
    const buildingQuery = {
      _id: deploymentId,
      state: expectedState
    }

    return this.findOneAndUpdateAsync(buildingQuery, {
      $set: {
        state: nextState
      }
    })
    .tap((deployment) => {
      if (!deployment) {
        log.error({ buildingQuery }, 'failed to find building deployment')

        return Deployment._determineStateError(deploymentId, expectedState)
      }
    })
  }

  /**
   * @param {String} deploymentId
   * @param {String} expectedState
   * @returns {Promise}
   * @resolves {Deployment}
   * @rejects {Deployment.NotFoundError}
   * @rejects {Deployment.IncorrectStateError}
   */
  static _determineStateError (deploymentId, expectedState) {
    return Deployment.findByIdAsync(deploymentId)
      .tap((deployment) => {
        if (!deployment) {
          log.error({ deploymentId }, 'failed to find deployment in correct state')

          throw new Deployment.NotFoundError({
            deploymentId
          })
        }

        if (deployment.state !== expectedState) {
          throw new Deployment.IncorrectStateError(expectedState, deployment.state)
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
 * Error thrown deployment failed to create
 * @param {string} opts - data object given to the deployment creation
 */
const NotChangedError = class extends BaseSchema.NotChangedError {
  constructor (opts) {
    super('Deployment', opts, 'debug')
  }
}

/**
 * Error thrown when deployment is not in the correct state for update
 * @param {string} expectedStatus expected status of deployment
 * @param {string} actualStatus   status of deployment
 */
const IncorrectStateError = class extends BaseSchema.IncorrectStateError {
  constructor (expectedStatus, actualStatus) {
    super('Deployment', expectedStatus, actualStatus, 'critical')
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
    super('Deployment', query, level || 'critical')
  }
}
