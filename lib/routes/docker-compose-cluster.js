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
const Boom = require('dat-middleware').Boom

const postSchema = joi.object({
  repo: joi.string().required(),
  branch: joi.string().required(),
  filePath: joi.string().required(),
  name: joi.string().required(),
  isTesting: joi.boolean().optional(),
  testReporters: joi.array().optional(),
  githubId: joi.number().optional(),
  parentInputClusterConfigId: joi.string().allow('').optional(),
  shouldNotAutoFork: joi.boolean().optional()
}).unknown().required()

const multiPostSchema = joi.object({
  repo: joi.string().required(),
  branch: joi.string().required(),
  filePath: joi.string().required(),
  isTesting: joi.boolean().optional(),
  testReporters: joi.array().optional(),
  githubId: joi.number().optional()
}).unknown().required()

const deleteSchema = joi.object({
  cluster: joi.object({
    id: joi.string().required()
  }).required().unknown()
}).unknown().required()

const redeploySchema = joi.object({
  instanceId: joi.string().required()
}).unknown().required()

const multiDeleteSchema = joi.object({
  cluster: joi.object({
    id: joi.string().required()
  }).required().unknown()
}).unknown().required()

function makeCreateOptsFromBody (sessionUser, body, mainInstanceServiceName) {
  const repoFullName = keypather.get(body, 'repo')
  const branchName = keypather.get(body, 'branch')
  const filePath = keypather.get(body, 'filePath')
  const clusterName = keypather.get(body, 'name')
  const githubId = keypather.get(body, 'githubId')
  const parentInputClusterConfigId = keypather.get(body, 'parentInputClusterConfigId')
  const isTesting = keypather.get(body, 'isTesting')
  const testReporters = keypather.get(body, 'testReporters')
  const shouldNotAutoFork = keypather.get(body, 'shouldNotAutoFork')
  return {
    mainInstanceServiceName,
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
    shouldNotAutoFork: shouldNotAutoFork || true,
    parentInputClusterConfigId: parentInputClusterConfigId || ''
  }
}

function generateHashClusterName () {
  var hashids = new Hashids(
    process.env.COMPOSE_HASHIDS_SALT,
    process.env.COMPOSE_HASHIDS_LENGTH,
    process.env.COMPOSE_HASHIDS_ALPHABET)
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
 * Takes the result from parsing the compose, and turns them into cluster create jobs
 * @param {SessionUser} sessionUser            - This user
 * @param {Object}      createClusterOptions   - From the request body, the options for these new clusters
 * @param {Object}      serviceNames
 * @param {String[]}    serviceNames.builds    - Clusters created from the owning repo
 * @param {String[]}    serviceNames.externals - Clusters created from github links
 * @param {Number}      serviceNames.total     - Total number of clusters to be generated
 */
function createClusters (sessionUser, createClusterOptions, serviceNames) {
  return Promise.map(serviceNames, (service) => {
    const opts = Object.assign({name: generateHashClusterName()}, createClusterOptions)
    return rabbitMQ.createCluster(makeCreateOptsFromBody(sessionUser, opts, service))
      .return({ service: service, hash: opts.name })
  })
}

/**
 * Enqueues a Cluster Create job for each build and external main in the Compose File
 *
 * @param {SessionUser} sessionUser - this user
 * @param {Object}      body        - cluster create options
 *
 * @resolves {Object}   results
 *           {Object[]} results.builds            - Clusters created from the owning repo
 *           {String}   results.builds.service    - Service name
 *           {String}   results.builds.hash       - Random Hash generated for this cluster
 *           {Object[]} results.externals         - Clusters created from github links
 *           {String}   results.externals.service - Service name
 *           {String}   results.externals.hash    - Random Hash generated for this cluster
 *           {Number}   results.total             - Total number of clusters to be generated
 */
const multiClusterCreate = function (sessionUser, body) {
  // First, we need to fetch the file(s), and get all of the mains
  const log = logger.child({
    method: 'multiClusterCreate',
    body
  })
  log.info('called')
  return joi.validateOrBoomAsync(body, multiPostSchema)
    .then(() => {
      if (body.filePath) {
        body.files = [{ path: body.filePath }]
      }
      return ClusterConfigService._parseComposeInfoForConfig(sessionUser, body)
    })
    .then((results) => {
      const serviceKeys = ClusterConfigService.getUniqueServicesKeysFromOctobearResults(results)
      // Now that we have the main instances, we need to create clusters for each one.
      return Promise.props({
        builds: createClusters(sessionUser, body, serviceKeys.builds),
        externals: createClusters(sessionUser, body, serviceKeys.externals)
      })
    })
    .tap((results) => {
      const buildKeys = results.builds
      const externals = results.externals
      results.total = buildKeys.length + externals.length
      log.info(`Created ${results.total} clusters`, { results })
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
      const message = 'cluster.delete job enqueued'
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
      const message = `${results.total} cluster.create jobs enqueued`
      return { json: { message, created: results }, status: 202 }
    })
    .asCallback(responseHandler.bind(null, res, next))
}

const multiDeleteRoute = function (req, res, next) {
  const clusterId = keypather.get(req, 'body.cluster.id')
  const log = logger.child({
    method: 'multiDeleteRoute',
    clusterId
  })
  log.info('called')
  return joi.validateOrBoomAsync(req.body, multiDeleteSchema)
    .tap(() => {
      log.trace('delete all clusters')
      return ClusterConfigService.deleteAllICC(clusterId)
    })
    .then(() => {
      const message = 'cluster.delete.multi job enqueued'
      return { json: { message }, status: 202 }
    })
    .asCallback(responseHandler.bind(null, res, next))
}

const multiFetchRoute = function (req, res, next) {
  const clusterId = keypather.get(req, 'params.id')
  const log = logger.child({
    method: 'multiFetchRoute',
    clusterId
  })
  log.info('called')
  return Promise.try(() => {
    if (!clusterId) {
      throw Boom.create(403, 'Invalid id parameter')
    }
    return ClusterConfigService.findAllRelatedClusters(clusterId)
  })
    .then((clusters) => {
      return { json: { clusters }, status: 202 }
    })
    .asCallback(responseHandler.bind(null, res, next))
}

app.post('/docker-compose-cluster/multi', multiCreateRoute)
app.post('/docker-compose-cluster/', postRoute)
app.delete('/docker-compose-cluster/', deleteRoute)
app.post('/docker-compose-cluster/redeploy/', redeployRoute)
app.delete('/docker-compose-cluster/multi/', multiDeleteRoute)
app.get('/docker-compose-cluster/:id/related', multiFetchRoute)

module.exports = app
module.exports.postRoute = postRoute
module.exports.deleteRoute = deleteRoute
module.exports.redeployRoute = redeployRoute
module.exports.multiClusterCreate = multiClusterCreate
module.exports.multiCreateRoute = multiCreateRoute
