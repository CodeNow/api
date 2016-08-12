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
var UserWhitelist = require('models/mongo/user-whitelist')
var messenger = require('socket/messenger')
var workerUtils = require('utils/worker-utils')

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
  var log = logger.child({ method: 'DockerEventsStreamConnected' })
  log.info('DockerEventsStreamConnected called')

  var githubId
  return workerUtils.validateJob(job, schema)
    .then(function updateDbFlag () {
      log.info('DockerEventsStreamConnected: updateDbFlag')
      githubId = parseInt(job.org, 10)
      return UserWhitelist.updateAsync({
        githubId: githubId,
        firstDockCreated: false
      }, {
        $set: {
          firstDockCreated: true
        }
      })
    })
    .then(function postUpdate (numAffected) {
      log.info({ numAffected: numAffected }, 'number of updated records')
      if (numAffected < 1) {
        throw new WorkerStopError(
          'firstDockCreated was set before',
          { job: job }, { level: 'info' }
        )
      }
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
}
