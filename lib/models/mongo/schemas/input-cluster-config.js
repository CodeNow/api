/**
 * @module lib/models/mongo/schemas/input-cluster-config
 */
'use strict'

const auditPlugin = require('./audit-plugin')
const Schema = require('mongoose').Schema

const InputClusterConfigSchema = new Schema({
  filePath: {
    required: 'Input Cluster Config requires file path',
    type: String
  },
  // The unique identifier given from the Repository for this file. We know the file has changed
  // if these are different
  fileSha: {
    required: 'Input Cluster Config requires a sha',
    type: String
  },
  clusterName: {
    required: 'Input Cluster Config requires a clusterName',
    type: String
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
