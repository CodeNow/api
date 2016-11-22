/**
 * @module lib/models/mongo/schemas/docker-compose-cluster
 */
'use strict'

const Schema = require('mongoose').Schema
const validators = require('models/mongo/schemas/schema-validators').commonValidators

module.exports = new Schema({
  dockerComposeFilePath: {
    required: 'Docker Compose Cluser requires compose file path',
    type: String
  },
  parentInstanceId: {
    required: 'Docker Compose Cluser requires parent instance id',
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
  }
})
