'use strict'

const auditPlugin = require('./audit-plugin')
const Schema = require('mongoose').Schema

// @ts-ignore
const ServiceSchema = new Schema({
  name: {
    required: 'Name of the service',
    type: String
  },
  error: {
    type: String
  },
  instanceId: Schema.Types.ObjectId,
  buildId: Schema.Types.ObjectId,
  buildStarted: {
    type: Date
  },
  buildFinished: {
    type: Date
  },
  deployed: {
    type: Date
  }
})

// @ts-ignore
const ClusterBuildSchema = new Schema({
  inputClusterConfigId: {
    type: Schema.Types.ObjectId,
    ref: 'InputClusterConfig'
  },
  autoIsolationConfigId: {
    type: Schema.Types.ObjectId,
    ref: 'AutoIsolationConfig'
  },
  isolationId: {
    type: Schema.Types.ObjectId,
    ref: 'Isolation'
  },
  state: {
    type: String,
    enum: [ 'created', 'parsing', 'parsed', 'building', 'built', 'deploying', 'deployed', 'errored', 'canceled' ],
    default: 'created'
  },
  services: {
    type: [ ServiceSchema ],
    'default': [],
    index: true
  },
  error: String,
  triggeredInfo: {
    type: {
      // triggered action
      action: {
        required: 'Triggered action is required',
        type: String,
        enum: [ 'webhook', 'manual' ]
      },
      repo: String,
      commit: String,
      branch: String
    }
  }
})

ClusterBuildSchema.plugin(auditPlugin, {
  modelName: 'ClusterBuild'
})

module.exports = ClusterBuildSchema
