/**
 * @module lib/models/mongo/schemas/docker-compose-config
 */
'use strict'

const auditPlugin = require('./audit-plugin')
const Schema = require('mongoose').Schema

const DockerComposeConfigSchema = new Schema({
  dockerComposeFilePath: {
    required: 'Docker Compose Cluster requires compose file path',
    type: String
  },
  autoIsolationConfigId: {
    required: 'AutoIsolationConfig is required',
    type: Schema.Types.ObjectId,
    ref: 'AutoIsolationConfig'
  }
})

DockerComposeConfigSchema.plugin(auditPlugin, {
  modelName: 'DockerComposeConfig'
})

module.exports = DockerComposeConfigSchema
