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
  static setStateToDeploying (deploymentId) {
    const buildingQuery = {
      id: deploymentId,
      state: 'building'
    }

    return this.findOneAndUpdateAsync(buildingQuery, {
      $set: {
        state: 'built'
      }
    })
    .tap((deployment) => {
      if (!deployment) {
        log.error({ buildingQuery }, 'failed to find deployment with context version and not container')

        return Deployment._returnCorrectNotFoundError(deploymentId)
      }
    })
  }

  static _returnCorrectNotFoundError (deploymentId) {
    return Deployment.findByIdAsync(deploymentId)
      .tap((deployment) => {
        if (!deployment) {
          log.error({ deploymentId }, 'failed to find deployment with container')

          throw new Deployment.NotFoundError({
            deploymentId
          })
        }

        if (deployment.state !== 'building') {
          throw new Deployment.IncorrectStateError('building', deployment.state)
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
