/**
 * @module lib/models/mongo/deployment
 */
'use strict'

const Promise = require('bluebird')
const mongoose = require('mongoose')

const auditPlugin = require('./audit-plugin')
const BaseSchema = require('models/mongo/schemas/base')
const DeploymentSchema = require('models/mongo/schemas/deployment')

DeploymentSchema.plugin(auditPlugin, {
  modelName: 'Deployment'
})

const Deployment = module.exports = mongoose.model('Deployment', DeploymentSchema)

Promise.promisifyAll(Deployment)
Promise.promisifyAll(Deployment.prototype)

/**
 * Error thrown instance failed to create
 * @param {string} opts - data object given to the instance creation
 */
Deployment.NotChangedError = class extends BaseSchema.NotChangedError {
  constructor (opts) {
    super('Deployment', opts, 'debug')
  }
}
