/**
 * @module lib/models/mongo/schemas/auto-isolation-config
 */
'use strict'

const auditPlugin = require('./audit-plugin')
const Schema = require('mongoose').Schema

const instanceRef = new Schema({
  org: String,
  repo: String,
  branch: String,
  instance: Schema.Types.ObjectId,
  matchBranch: Boolean
})

const AutoIsolationConfigSchema = new Schema({
  instance: {
    type: Schema.Types.ObjectId,
    ref: 'Instance'
  },
  requestedDependencies: [ instanceRef ],
  redeployOnKilled: {
    type: Boolean
  }
})

AutoIsolationConfigSchema.plugin(auditPlugin, {
  modelName: 'AutoIsolationConfig'
})

module.exports = AutoIsolationConfigSchema
