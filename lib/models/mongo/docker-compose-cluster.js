/**
 * @module lib/models/mongo/docker-compose-cluster
 */
'use strict'

const Promise = require('bluebird')
const mongoose = require('mongoose')

const DockerComposeClusterSchema = require('models/mongo/schemas/docker-compose-cluster')

const DockerComposeCluster = module.exports = mongoose.model('DockerComposeCluster', DockerComposeClusterSchema)

Promise.promisifyAll(DockerComposeCluster)
Promise.promisifyAll(DockerComposeCluster.prototype)
