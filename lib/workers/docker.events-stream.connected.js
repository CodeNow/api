/**
 * @module lib/workers/docker.events-stream.connected
 */
'use strict'
require('loadenv')()

var TaskFatalError = require('ponos').TaskFatalError
var Promise = require('bluebird')
var rabbitMQ = require('models/rabbitmq')
var logger = require('logger')
var joi = require('utils/joi')
var OrganizationService = require('models/services/organization-service')
var messenger = require('socket/messenger')

var schema = joi.object({
  host: joi.string().uri({ scheme: 'http' }).required(),
  org: joi.orgId().required(),
  tid: joi.string()
}).unknown().required().label('docker.events-stream.connected job')

/**
 * Handle docker.events-stream.connected event
 * @param  {Object}  job    rabbit job object
 * @return {Promise} worker task promise
 */
module.exports = function DockerEventsStreamConnected (job) {
  var log = logger.child({
    job: job,
    queue: 'docker.events-stream.connected',
    tx: true
  })
  var githubId
  return joi.validateOrBoomAsync(job, schema)
    .catch(function (err) {
      throw new TaskFatalError(
        'docker.events-stream.connected',
        'Job failed validation',
        { err: err }
      )
    })
    .then(function updateDbFlag () {
      log.info('DockerEventsStreamConnected: updateDbFlag')
      githubId = parseInt(job.org, 10)
      return OrganizationService.updateByGithubId(
        githubId,
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
        log.error({ err: err }, 'DockerEventsStreamConnected: failed to notify')
        throw new TaskFatalError(
          'docker.events-stream.connected',
          'Failed to create job or send websocket event',
          { err: err, job: job }
        )
      })
    })
}
