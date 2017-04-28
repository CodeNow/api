/**
 * @module lib/models/mongo/schemas/input-cluster-config
 */
'use strict'

const auditPlugin = require('./audit-plugin')
const Schema = require('mongoose').Schema

var InputFileSchema = new Schema({
  path: {
    required: 'Input file requires file path',
    type: String
  },
  // The unique identifier given from the Repository for this file. We know the file has changed
  // if these are different
  sha: {
    required: 'Input file requires a sha',
    type: String
  }
})

const InputClusterConfigSchema = new Schema({
  clusterName: {
    required: 'Input Cluster Config requires a clusterName',
    type: String
  },
  files: {
    type: [ InputFileSchema ],
    'default': [],
    index: true
  },
  isTesting: {
    type: Boolean
  },
  parentInputClusterConfigId: {
    type: Schema.Types.ObjectId,
    ref: 'InputClusterConfig'
  },
  autoIsolationConfigId: {
    required: 'Input Cluster Config requires AutoIsolationConfig id',
    type: Schema.Types.ObjectId,
    ref: 'AutoIsolationConfig'
  }
})

InputClusterConfigSchema.plugin(auditPlugin, {
  modelName: 'InputClusterConfig'
})

module.exports = InputClusterConfigSchema
