'use strict'

const auditPlugin = require('./audit-plugin')
const Schema = require('mongoose').Schema

// @ts-ignore
const SpecificationSchema = new Schema({
  name: {
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
  },
  envs: {
    type: [Schema.Types.Mixed],
    'default': []
  },
  ports: {
    type: [Schema.Types.Number],
    'default': []
  },
  image: {
    type: String
  },
  memorySoftLimit: {
    type: String
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
  specifications: {
    type: [ SpecificationSchema ],
    'default': [],
    index: true
  },
  errorMessage: String,
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
