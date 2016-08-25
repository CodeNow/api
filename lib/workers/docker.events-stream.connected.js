/**
 * @module lib/workers/docker.events-stream.connected
 */
'use strict'
require('loadenv')()

var WorkerStopError = require('error-cat/errors/worker-stop-error')
var Promise = require('bluebird')
var rabbitMQ = require('models/rabbitmq')
var logger = require('logger')
var joi = require('utils/joi')
var OrganizationService = require('models/services/organization-service')
var messenger = require('socket/messenger')

module.exports.jobSchema = joi.object({
  host: joi.string().uri({ scheme: 'http' }).required(),
  org: joi.orgId().required(),
  tid: joi.string()
}).unknown().required().label('docker.events-stream.connected job')

module.exports.maxNumRetries = 5

/**
 * Handle docker.events-stream.connected event
 * @param  {Object}  job    rabbit job object
 * @return {Promise} worker task promise
 */
module.exports.task = function DockerEventsStreamConnected (job) {
  var log = logger.child({ method: 'DockerEventsStreamConnected' })
  log.info('DockerEventsStreamConnected called')

  var githubId
  return Promise.try(function updateDbFlag () {
    log.info('DockerEventsStreamConnected: updateDbFlag')
    githubId = parseInt(job.org, 10)
    return OrganizationService.getByGithubId(githubId)
  })
  .tap(function checkIfFirstDockCreated (org) {
    log.info('Org result', { org: org })
    if (org.firstDockCreated) {
      throw new WorkerStopError(
        'firstDockCreated was set before',
        { job: job }, { level: 'info' }
      )
    }
  })
  .then(function updateDbFlag (org) {
    return OrganizationService.updateById(
      org.id,
      { firstDockCreated: true }
    )
  })
  .then(function postUpdate (res) {
    log.trace({ res: res }, 'Response from updating organization')
  })
  .then(function () {
    log.info('create first.dock.created job and send websocket event')
    // if error happens on these next two calls
    return Promise.try(function () {
      messenger.emitFirstDockCreated(githubId)
      // rabbimq should always be the last call
      rabbitMQ.firstDockCreated({
        githubId: githubId
      })
    })
    .catch(function (err) {
      log.error({ err: err }, 'failed to notify')
      throw new WorkerStopError(
        'Failed to create job or send websocket event',
        { err: err, job: job }
      )
    })
  })
  .catch(function (err) {
    if (~err.message.indexOf('Organization not found')) {
      log.warn({ err: err }, 'Organization not found')
      throw new WorkerStopError(
        'Organization not found',
        { err: err, job: job }
      )
    }

    throw err
  })
}
