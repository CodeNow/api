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
  parsedCompose: {
    type: [Schema.Types.Mixed],
    'default': []
  }
  // TODO : add aic: ObjectId
})
