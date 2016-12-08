/**
 * @module lib/models/mongo/schemas/docker-compose-cluster
 */
'use strict'

const Schema = require('mongoose').Schema
const validators = require('models/mongo/schemas/schema-validators').commonValidators

module.exports = new Schema({
  dockerComposeFilePath: {
    required: 'Docker Compose Cluster requires compose file path',
    type: String
  },
  parentInstanceId: {
    type: Schema.Types.ObjectId,
    ref: 'Instance',
    unique: true,
    sparse: true
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
  // big poppa user id
  createdByUser: {
    required: 'Docker Compose Cluster requires createdByUser',
    type: Number
  },
  // big poppa org id
  ownedByOrg: {
    required: 'Docker Compose Cluster requires ownedByOrg',
    type: Number
  },
  triggeredAction: {
    required: 'Docker Compose Cluster requires triggeredAction',
    type: String
  }
})
