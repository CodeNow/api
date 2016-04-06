/**
 * @module lib/models/mongo/schemas/auto-isolation-config
 */
'use strict'

var Schema = require('mongoose').Schema

var otherInstanceReference = new Schema({
  lowerRepo: {
    required: 'AIC refs need a lower repo',
    type: String
  },
  lowerBranch: {
    required: 'AIC refs need a branch',
    type: String
  }
})

module.exports = new Schema({
  instance: {
    required: 'Auto Isolation Config requires an Instance',
    type: Schema.Types.ObjectId,
    ref: 'Instance'
  },
  requestedDependencies: [ otherInstanceReference ]
})
