/**
 * @module lib/models/mongo/cluster-build
 */
'use strict'

const Promise = require('bluebird')
const mongoose = require('mongoose')

const auditPlugin = require('./audit-plugin')
const BaseSchema = require('models/mongo/schemas/base')
const ClusterBuildSchema = require('models/mongo/schemas/cluster-build')

ClusterBuildSchema.plugin(auditPlugin, {
  modelName: 'ClusterBuild'
})

const ClusterBuild = module.exports = mongoose.model('ClusterBuild', ClusterBuildSchema)

Promise.promisifyAll(ClusterBuild)
Promise.promisifyAll(ClusterBuild.prototype)

/**
 * Error thrown ClusterBuild failed to create
 * @param {string} opts - data object given to the ClusterBuild creation
 */
ClusterBuild.NotChangedError = class extends BaseSchema.NotChangedError {
  constructor (opts) {
    super('ClusterBuild', opts, 'debug')
  }
}
