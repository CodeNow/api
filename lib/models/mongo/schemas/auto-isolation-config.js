/**
 * @module lib/models/mongo/schemas/auto-isolation-config
 */
'use strict'

const Schema = require('mongoose').Schema
const validators = require('models/mongo/schemas/schema-validators').commonValidators

const dependencyInstanceRef = new Schema({
  org: String,
  repo: String,
  branch: String,
  instance: Schema.Types.ObjectId,
  matchBranch: Boolean
})

module.exports = new Schema({
  instance: {
    type: Schema.Types.ObjectId,
    ref: 'Instance'
  },
  requestedDependencies: [ dependencyInstanceRef ],
  redeployOnKilled: {
    type: Boolean
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
  }
})
