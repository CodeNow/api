/**
 * @module lib/models/mongo/schemas/deployment
 */
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
const DeploymentSchema = new Schema({
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
  triggeredAction: {
    type: String,
    enum: [ 'webhook', 'manual' ]
  },
  triggerInfo: {
    type: {
      repo: String,
      commit: String,
      branch: String
    }
  }
})

DeploymentSchema.plugin(auditPlugin, {
  modelName: 'Deployment'
})

module.exports = DeploymentSchema
