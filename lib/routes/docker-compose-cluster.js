'use strict'

const joi = require('utils/joi')
const express = require('express')
const keypather = require('keypather')()

const app = express()

const logger = require('logger')
const rabbitMQ = require('models/rabbitmq')
const responseHandler = require('routes/promise-response-handler').responseHandler

const postSchema = joi.object({
  repo: joi.string().required(),
  branch: joi.string().required(),
  filePath: joi.string().required(),
  name: joi.string().required(),
  isTesting: joi.boolean().optional(),
  testReporters: joi.array().optional(),
  githubId: joi.number().optional(),
  inputClusterConfigId: joi.string().optional()
}).unknown().required()

const deleteSchema = joi.object({
  cluster: joi.object({
    id: joi.string().required()
  }).required().unknown()
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
  const log = logger.child({
    method: 'post',
    repo: keypather.get(req, 'body.repo'),
    branch: keypather.get(req, 'body.branch'),
    filePath: keypather.get(req, 'body.filePath'),
    newInstanceName: keypather.get(req, 'body.name')
  })
  log.info('called')
  return joi.validateOrBoomAsync(req.body, postSchema)
    .then(function () {
      log.trace('create cluster')
      rabbitMQ.createCluster({
        sessionUserBigPoppaId: keypather.get(req, 'sessionUser._bigPoppaUser.id'),
        triggeredAction: 'user',
        repoFullName: req.body.repo,
        branchName: req.body.branch,
        filePath: req.body.filePath,
        githubId: req.body.githubId,
        isTesting: req.body.isTesting || false,
        testReporters: req.body.testReporters || [],
        newInstanceName: req.body.name,
        inputClusterConfigId: req.body.inputClusterConfigId
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

app.post('/docker-compose-cluster/', postRoute)
app.delete('/docker-compose-cluster/', deleteRoute)

module.exports = app
module.exports.postRoute = postRoute
module.exports.deleteRoute = deleteRoute
