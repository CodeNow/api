'use strict'

const joi = require('utils/joi')
const express = require('express')
const keypather = require('keypather')()
const Promise = require('bluebird')

const app = express()

const uuid = require('uuid')
const logger = require('logger')
const rabbitMQ = require('models/rabbitmq')
const responseHandler = require('routes/promise-response-handler').responseHandler
const Instance = require('models/mongo/instance')
const ClusterConfigService = require('models/services/cluster-config-service')
const Hashids = require('hashids')

const postSchema = joi.object({
  repo: joi.string().required(),
  branch: joi.string().required(),
  filePath: joi.string().required(),
  name: joi.string().required(),
  isTesting: joi.boolean().optional(),
  testReporters: joi.array().optional(),
  githubId: joi.number().optional(),
  parentInputClusterConfigId: joi.string().allow('').optional()
}).unknown().required()

const deleteSchema = joi.object({
  cluster: joi.object({
    id: joi.string().required()
  }).required().unknown()
}).unknown().required()

const redeploySchema = joi.object({
  instanceId: joi.string().required()
}).unknown().required()

function makeCreateOptsFromBody (sessionUser, body, mainInstanceKey) {
  const repoFullName = keypather.get(body, 'repo')
  const branchName = keypather.get(body, 'branch')
  const filePath = keypather.get(body, 'filePath')
  const clusterName = keypather.get(body, 'name')
  const githubId = keypather.get(body, 'githubId')
  const parentInputClusterConfigId = keypather.get(body, 'parentInputClusterConfigId')
  const isTesting = keypather.get(body, 'isTesting')
  const testReporters = keypather.get(body, 'testReporters')
  return {
    mainInstanceKey,
    clusterCreateId: uuid(),
    sessionUserBigPoppaId: keypather.get(sessionUser, '_bigPoppaUser.id'),
    triggeredAction: 'user',
    repoFullName,
    branchName,
    filePath,
    githubId,
    isTesting: isTesting || false,
    testReporters: testReporters || [],
    clusterName,
    parentInputClusterConfigId: parentInputClusterConfigId || ''
  }
}

function generateHashClusterName () {
  var hashids = new Hashids(
    process.env.HASHIDS_SALT,
    process.env.HASHIDS_LENGTH,
    'abcdefghijklmnopqrstuvwxyz0123456789')
  return hashids.encrypt(new Date().getTime())
}

/**
 * Enqueue a cluster.create job
 *
 * @param {Object}     req - Express request object
 * @param {Object}     res - Express response object
 * @param {Function}   next
 * @returns {Promise}
 * @resolves {Object}
 */
const postRoute = function (req, res, next) {
  const sessionUser = keypather.get(req, 'sessionUser')
  const body = keypather.get(req, 'body')
  const log = logger.child({
    method: 'post',
    body
  })
  log.info('called')
  return joi.validateOrBoomAsync(body, postSchema)
    .then(function () {
      log.trace('create cluster')
      return rabbitMQ.createCluster(makeCreateOptsFromBody(sessionUser, body))
    })
    .then(function () {
      const message = 'cluster.create job enqueued'
      return { json: { message }, status: 202 }
    })
    .asCallback(responseHandler.bind(null, res, next))
}

/**
 * Enqueues a Cluster Create job for each build and external main in the Compose File
 *
 * @param {SessionUser} sessionUser - this user
 * @param {Object}      body        - cluster create options
 * @resolves {Number} The number of cluster create jobs created
 */
const multiClusterCreate = function (sessionUser, body) {
  // First, we need to fetch the file(s), and get all of the mains
  const log = logger.child({
    method: 'multiClusterCreate',
    body
  })

  // Create a unique cluster name
  body.name = generateHashClusterName()
  log.info('called')
  return joi.validateOrBoomAsync(body, postSchema)
    .then(() => {
      return ClusterConfigService._parseComposeInfoForConfig(sessionUser, body)
    })
    .tap((results) => {
      const buildKeys = Object.keys(results.mains.builds)
      // Now that we have the main instances, we need to create clusters for each one.
      return Promise.map(buildKeys, (buildKey) => {
        return rabbitMQ.createCluster(makeCreateOptsFromBody(sessionUser, body, buildKey))
      })
    })
    .tap((results) => {
      const externals = Object.keys(results.mains.externals)
      return Promise.map(externals, (externalKey) => {
        return rabbitMQ.createCluster(makeCreateOptsFromBody(sessionUser, body, externalKey))
      })
    })
    .then((results) => {
      const buildKeys = Object.keys(results.mains.builds)
      const externals = Object.keys(results.mains.externals)
      return buildKeys.length + externals.length
    })
}

/**
 * Enqueue a cluster.delete job
 *
 * @param {Object}     req - Express request object
 * @param {Object}     res - Express response object
 * @param {Function}   next
 * @returns {Promise}
 * @resolves {Object}
 */
const deleteRoute = function (req, res, next) {
  const log = logger.child({
    method: 'delete',
    clusterId: keypather.get(req, 'body.cluster.id')
  })
  log.info('called')
  return joi.validateOrBoomAsync(req.body, deleteSchema)
    .then(function () {
      log.trace('delete cluster')
      rabbitMQ.deleteCluster({
        cluster: {
          id: keypather.get(req, 'body.cluster.id')
        }
      })
      const message = 'clutser.delete job enqueued'
      return { json: { message }, status: 202 }
    })
    .asCallback(responseHandler.bind(null, res, next))
}

const redeployRoute = function (req, res, next) {
  const instanceId = req.body.instanceId
  const log = logger.child({
    method: 'redeployRoute',
    instanceId
  })
  log.info('called')
  return joi.validateOrBoomAsync(req.body, redeploySchema)
    .then(function () {
      return Instance.findOneAsync({'_id': instanceId})
        .then((instance) => {
          let isolationId = instance.isolated.toString()
          return rabbitMQ.killIsolation({ isolationId: isolationId, triggerRedeploy: true })
        })
    })
    .asCallback(responseHandler.bind(null, res, next))
}

function multiCreateRoute (req, res, next) {
  const sessionUser = keypather.get(req, 'sessionUser')
  const body = keypather.get(req, 'body')

  return multiClusterCreate(sessionUser, body)
    .then((results) => {
      const message = '' + results + ' cluster.create jobs enqueued'
      return { json: { message }, status: 202 }
    })
    .asCallback(responseHandler.bind(null, res, next))
}

app.post('/docker-compose-cluster/multi', multiCreateRoute)
app.post('/docker-compose-cluster/', postRoute)
app.delete('/docker-compose-cluster/', deleteRoute)
app.post('/docker-compose-cluster/redeploy/', redeployRoute)

module.exports = app
module.exports.postRoute = postRoute
module.exports.deleteRoute = deleteRoute
module.exports.redeployRoute = redeployRoute
module.exports.multiClusterCreate = multiClusterCreate
module.exports.multiCreateRoute = multiCreateRoute
