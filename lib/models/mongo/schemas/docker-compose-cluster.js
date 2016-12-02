/**
 * @module lib/models/mongo/schemas/docker-compose-cluster
 */
'use strict'

const Schema = require('mongoose').Schema
const validators = require('models/mongo/schemas/schema-validators').commonValidators

const DockerComposeClusterSchema = module.exports = new Schema({
  dockerComposeFilePath: {
    required: 'Docker Compose Cluser requires compose file path',
    type: String
  },
  parentInstanceId: {
    type: Schema.Types.ObjectId,
    ref: 'Instance',
    index: true
  },
  siblingsInstanceIds: {
    type: [{
      type: Schema.Types.ObjectId,
      ref: 'Instance'
    }]
  },
  /** @type: date */
  created: {
    type: Date,
    'default': Date.now,
    validate: validators.beforeNow({model: 'DockerComposeCluster', literal: 'created'})
  },
  deleted: {
    type: Date,
    validate: validators.beforeNow({model: 'DockerComposeCluster', literal: 'deleted'})
  },
  // big poppa id
  createdBy: {
    required: 'Docker Compose Cluster require an createdBy',
    type: Number
  },
  triggeredAction: {
    required: 'Docker Compose Cluster require an triggeredAction',
    type: String
  }
})

DockerComposeClusterSchema.index({ parentInstanceId: 1, deleted: 1 }, { unique: true })
