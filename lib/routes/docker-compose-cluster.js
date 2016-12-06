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
  dockerComposeFilePath: joi.string().required(),
  name: joi.string().required()
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
    dockerComposeFilePath: keypather.get(req, 'body.dockerComposeFilePath'),
    newInstanceName: keypather.get(req, 'body.name')
  })
  log.info('called')
  return joi.validateOrBoomAsync(req.body, postSchema)
    .then(function () {
      log.trace('create cluster')
      rabbitMQ.createCluster({
        sessionUserGithubId: keypather.get(req, 'sessionUser.accounts.github.id'),
        triggeredAction: 'user',
        repoName: req.body.repo,
        branchName: req.body.branch,
        dockerComposeFilePath: req.body.dockerComposeFilePath,
        newInstanceName: req.body.name
      })
      const message = 'clutser.create job enqueued'
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