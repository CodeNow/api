/**
 * @module lib/models/mongo/schemas/docker-compose-cluster
 */
'use strict'

const Schema = require('mongoose').Schema

module.exports = new Schema({
  dockerComposeFilePath: {
    required: 'Docker Compose Cluster requires compose file path',
    type: String
  },
  // TODO : delete
  parentInstanceId: {
    type: Schema.Types.ObjectId,
    ref: 'Instance',
    sparse: true
  },
  // TODO : delete
  parsedCompose: {
    type: [Schema.Types.Mixed],
    'default': []
  },
  // TODO : add aic: ObjectId
  // TODO : delete
  instancesIds: {
    type: [{
      type: Schema.Types.ObjectId,
      ref: 'Instance'
    }]
  }
})
