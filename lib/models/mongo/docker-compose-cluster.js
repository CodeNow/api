/**
 * @module lib/models/mongo/docker-compose-cluster
 */
'use strict'

const Promise = require('bluebird')
const BaseError = require('error-cat/errors/base-error')
const mongoose = require('mongoose')

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

const DockerComposeCluster = module.exports = mongoose.model('DockerComposeCluster', DockerComposeClusterSchema)

Promise.promisifyAll(DockerComposeCluster)
Promise.promisifyAll(DockerComposeCluster.prototype)
