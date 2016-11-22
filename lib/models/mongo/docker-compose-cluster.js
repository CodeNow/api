/**
 * @module lib/models/mongo/docker-compose-cluster
 */
'use strict'

const Promise = require('bluebird')
const BaseError = require('error-cat/errors/base-error')
const logger = require('logger')
const mongoose = require('mongoose')
const objectId = require('objectid')

const DockerComposeClusterSchema = require('models/mongo/schemas/docker-compose-cluster')

/**
 * Error thrown when an docker-compose-cluster is not found
 * @param {Object} query     query made for instance
 * @param {Object} data      extra error data
 * @param {Object} reporting reporting options
 */
class NotFoundError extends BaseError {
  constructor (query) {
    super('DockerComposeCluster not found', {
      query: query
    }, {
      level: 'debug'
    })
  }
}

DockerComposeClusterSchema.statics.NotFoundError = NotFoundError

DockerComposeClusterSchema.statics.markAsDeleted = function (clusterId) {
  const log = logger.child({
    method: 'markAsDeleted',
    module: 'DockerComposeCluster',
    clusterId: clusterId
  })
  log.info('DockerComposeClusterSchema.statics.markAsDeleted called')
  return DockerComposeCluster.findOneAndUpdate({
    _id: objectId(clusterId),
    deleted: {
      $exists: false
    }
  }, {
    $set: {
      deleted: Date.now()
    }
  })
}

DockerComposeClusterSchema.statics.findActive = function (parentInstanceId) {
  const log = logger.child({
    method: 'findActive',
    module: 'DockerComposeCluster',
    instanceId: parentInstanceId
  })
  log.info('DockerComposeClusterSchema.statics.findActive called')
  const query = {
    'parentInstanceId': objectId(parentInstanceId),
    deleted: {
      $exists: false
    }
  }
  return DockerComposeCluster.findOneAsync(query)
    .tap(function (cluster) {
      if (!cluster) {
        throw new DockerComposeCluster.NotFoundError(query)
      }
    })
}

const DockerComposeCluster = module.exports = mongoose.model('DockerComposeCluster', DockerComposeClusterSchema)

Promise.promisifyAll(DockerComposeCluster)
Promise.promisifyAll(DockerComposeCluster.prototype)
