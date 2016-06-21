/**
 * @module lib/models/mongo/schemas/auto-isolation-config
 */
'use strict'

var Schema = require('mongoose').Schema

var otherInstanceReference = new Schema({
  org: String,
  repo: String,
  branch: String,
  instance: Schema.Types.ObjectId,
  matchBranch: Boolean
})

module.exports = new Schema({
  instance: {
    required: 'Auto Isolation Config requires an Instance',
    type: Schema.Types.ObjectId,
    ref: 'Instance'
  },
  requestedDependencies: [ otherInstanceReference ],
  redeployOnKilled: {
    type: Boolean
  }
})
