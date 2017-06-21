/**
 * @module lib/models/mongo/schemas/cluster-build
 */
'use strict'

const auditPlugin = require('./audit-plugin')
const Schema = require('mongoose').Schema

// @ts-ignore
// Specification (service definition) consist of properties that can't be changed once set.
// The whole record changes over time, but not property.
const SpecificationSchema = new Schema({
  // can't be changed once set
  name: {
    required: 'Name of the service',
    type: String
  },
  // can't be changed once set
  buildId: Schema.Types.ObjectId,
  // can't be changed once set
  error: {
    type: String
  },
  // can't be changed once set
  buildStarted: {
    type: Date
  },
  // can't be changed once set
  buildFinished: {
    type: Date
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
  // Mutable. Can be changed during lifecycle of cluster build
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
  // the state of each specification however can change over time
  specifications: {
    type: [ SpecificationSchema ],
    'default': [],
    index: true
  }
})

ClusterBuildSchema.plugin(auditPlugin, {
  modelName: 'ClusterBuild'
})

module.exports = ClusterBuildSchema
