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
