/**
 * @module lib/models/mongo/docker-compose-cluster
 */
'use strict'

const Promise = require('bluebird')
const BaseError = require('error-cat/errors/base-error')
const logger = require('logger').child({ module: 'DockerComposeCluster' })
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
    super('DockerComposeCluster not found', { query }, { level: 'debug' })
  }
}

DockerComposeClusterSchema.statics.NotFoundError = NotFoundError

/**
 * Mark active docker compose cluster as deleted
 * @param {ObjectId} clusterId - id of the cluster
 * @resolves  if cluster was marked as deleted
 */
DockerComposeClusterSchema.statics.markAsDeleted = function (clusterId) {
  const log = logger.child({
    method: 'markAsDeleted',
    clusterId: clusterId
  })
  log.info('DockerComposeClusterSchema.statics.markAsDeleted called')
  return DockerComposeCluster.findOneAndUpdateAsync({
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

/**
 * Find active (not deleted) DockerComposeCluster by `parentInstanceId`
 * @param {ObjectId} parentInstanceId - id of the parent instance
 * @resolves {DockerComposeCluster} docker compose cluster model
 * @rejects {DockerComposeCluster.NotFoundError}  if active model wasn't found
 */
DockerComposeClusterSchema.statics.findActiveByParentId = function (parentInstanceId) {
  const log = logger.child({
    method: 'findActive',
    instanceId: parentInstanceId
  })
  log.info('DockerComposeClusterSchema.statics.findActive called')
  const query = {
    parentInstanceId: objectId(parentInstanceId),
    deleted: {
      $exists: false
    }
  }
  return DockerComposeCluster.findOneAsync(query)
    .tap(function (cluster) {
      if (!cluster) {
        throw new NotFoundError(query)
      }
    })
}

const DockerComposeCluster = module.exports = mongoose.model('DockerComposeCluster', DockerComposeClusterSchema)

Promise.promisifyAll(DockerComposeCluster)
Promise.promisifyAll(DockerComposeCluster.prototype)
