'use strict'

const joi = require('utils/joi')
const express = require('express')
const app = express()
const logger = require('middlewares/logger')(__filename)
const keypather = require('keypather')()
const rabbitMQ = require('models/rabbitmq')

const postSchema = joi.object({
  repo: joi.string().required(),
  branch: joi.string().required(),
  dockerComposeFilePath: joi.string().required(),
  name: joi.string().required()
}).unknown().required()

const deleteSchema = joi.object({
  repo: joi.string().required(),
  branch: joi.string().required(),
  dockerComposeFilePath: joi.string().required(),
  name: joi.string().required()
}).unknown().required()

const post = function (req, res, next) {
  const log = logger.log.child({
    method: 'post',
    repo: keypather.get(req, 'body.repo'),
    branch: keypather.get(req, 'body.branch'),
    dockerComposeFilePath: keypather.get(req, 'body.dockerComposeFilePath'),
    name: keypather.get(req, 'body.name')
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
      res.status(202).json({ message })
    })
}

const delete = function (req, res, next) {
  const log = logger.log.child({
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
      res.status(202).json({ message })
    })
}

app.post('/docker-compose-cluster/', post)
app.delete('/docker-compose-cluster/', delete)

Object.assign(app, { post, delete })
module.exports = app
