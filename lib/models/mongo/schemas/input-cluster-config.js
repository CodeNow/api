/**
 * @module lib/models/mongo/schemas/input-cluster-config
 */
'use strict'

const auditPlugin = require('./audit-plugin')
const Schema = require('mongoose').Schema

const InputClusterConfigSchema = new Schema({
  dockerComposeFilePath: {
    required: 'Input Cluster Config requires compose file path',
    type: String
  },
  autoIsolationConfigId: {
    required: 'AutoIsolationConfig is required',
    type: Schema.Types.ObjectId,
    ref: 'AutoIsolationConfig'
  }
})

InputClusterConfigSchema.plugin(auditPlugin, {
  modelName: 'InputClusterConfig'
})

module.exports = InputClusterConfigSchema
