/**
 * @module lib/models/mongo/schemas/cluster-build
 */
'use strict'

const auditPlugin = require('./audit-plugin')
const Schema = require('mongoose').Schema

// @ts-ignore
// Specification (service definition) consist of two two groups of properties:
// - spec - immutable one which cannot be changed once set
// - state - mutable properties that change during `ClusterBuild` lifecicle
const SpecificationSchema = new Schema({
  // spec is immuatble. Can't be changed once created
  spec: {
    type: {
      name: {
        required: 'Name of the service',
        type: String
      },
      buildId: Schema.Types.ObjectId
    }
  },
  // state of the service might chnage
  state: {
    type: {
      error: {
        type: String
      },
      buildStarted: {
        type: Date
      },
      buildFinished: {
        type: Date
      }
    }
  }
})

// @ts-ignore
const ClusterBuildSchema = new Schema({
  // Immutable. Can't be changed after set
  inputClusterConfigId: {
    type: Schema.Types.ObjectId,
    ref: 'InputClusterConfig'
  },
  // Immutable. Can't be changed after set
  autoIsolationConfigId: {
    type: Schema.Types.ObjectId,
    ref: 'AutoIsolationConfig'
  },
  // Immutable. Can't be changed after set
  isolationId: {
    type: Schema.Types.ObjectId,
    ref: 'Isolation'
  },
  // Immutable. Can't be changed after set
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
  },
  // Mutable. Can be changed during lifecycle of deployment
  state: {
    type: String,
    enum: [
      'created',
      'parsing', 'parsed',
      'building', 'built',
      'deploying', 'deployed',
      'errored', 'canceled' ],
    default: 'created'
  },
  // specifications are like compose services
  // once specifications created the list can't be modified.
  // what can be changed is the `state` of each `specification`
  specifications: {
    type: [ SpecificationSchema ],
    'default': [],
    index: true
  }
})

ClusterBuildSchema.plugin(auditPlugin, {
  modelName: 'Deployment'
})

module.exports = ClusterBuildSchema
