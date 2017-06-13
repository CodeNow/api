'use strict'

const joi = require('utils/joi')
const express = require('express')
const keypather = require('keypather')()

const app = express()

const logger = require('logger')
const rabbitMQ = require('models/rabbitmq')
const responseHandler = require('routes/promise-response-handler').responseHandler
const Instance = require('models/mongo/instance')
const DeploymentService = require('models/services/deployment-service')
const OrganizationService = require('models/services/organization-service')

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
  const sessionUserBigPoppaId = keypather.get(req, 'sessionUser._bigPoppaUser.id')
  const repoFullName = keypather.get(req, 'body.repo')
  const branchName = keypather.get(req, 'body.branch')
  const filePath = keypather.get(req, 'body.filePath')
  const clusterName = keypather.get(req, 'body.name')
  const githubId = keypather.get(req, 'body.githubId')
  const parentInputClusterConfigId = keypather.get(req, 'body.parentInputClusterConfigId')
  const isTesting = keypather.get(req, 'body.isTesting')
  const testReporters = keypather.get(req, 'body.testReporters')
  const log = logger.child({
    method: 'post',
    repoFullName,
    branchName,
    filePath,
    githubId,
    isTesting,
    clusterName,
    parentInputClusterConfigId
  })
  log.info('called')
  return joi.validateOrBoomAsync(req.body, postSchema)
    .then(() => {
      return OrganizationService.getBpOrgInfoFromRepoName(req.sessionUser, githubId)
        .then((organization) => {
          return DeploymentService.create(sessionUserBigPoppaId, organization.id, 'manual', {
            repo: repoFullName,
            branch: branchName
          })
        })
    })
    .then((deployment) => {
      log.trace({ deployment }, 'create cluster')
      rabbitMQ.createCluster({
        deploymentId: deployment._id.toString(),
        filePath,
        githubId,
        isTesting: isTesting || false,
        testReporters: testReporters || [],
        clusterName,
        parentInputClusterConfigId: parentInputClusterConfigId || ''
      })
      const message = 'cluster.create job enqueued'
      return { json: { message }, status: 202 }
    })
    .asCallback(responseHandler.bind(null, res, next))
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

app.post('/docker-compose-cluster/', postRoute)
app.delete('/docker-compose-cluster/', deleteRoute)
app.post('/docker-compose-cluster/redeploy/', redeployRoute)

module.exports = app
module.exports.postRoute = postRoute
module.exports.deleteRoute = deleteRoute
module.exports.redeployRoute = redeployRoute
