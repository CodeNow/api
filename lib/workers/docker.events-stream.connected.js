/**
 * @module lib/workers/docker.events-stream.connected
 */
'use strict'
require('loadenv')()

var TaskFatalError = require('ponos').TaskFatalError

var rabbitMQ = require('models/rabbitmq')
var logger = require('logger')
var joi = require('utils/joi')
var UserWhitelist = require('models/mongo/user-whitelist')
var messenger = require('socket/messenger')

var schema = joi.object({
  host: joi.string().uri({ scheme: 'http' }).required(),
  org: joi.string().regex(/^[0-9]*$/, ['orgId']).required()
}).unknown().required().label('job')

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
      var githubId = parseInt(job.org, 10)
      return UserWhitelist.updateAsync({
        githubId: githubId,
        firstDockCreated: false
      }, {
        $set: {
          firstDockCreated: true
        }
      })
      .tap(function postUpdate (numAffected) {
        log.info({ numAffected: numAffected }, 'number of updated records')
        if (numAffected < 1) {
          throw new TaskFatalError(
            'docker.events-stream.connected',
            'firstDockCreated was set before',
            { report: false, job: job }
          )
        }
      })
      .tap(function () {
        var githubId = parseInt(job.org, 10)
        rabbitMQ.firstDockCreated({
          githubId: githubId
        })
      })
      .tap(function () {
        var githubId = parseInt(job.org, 10)
        messenger.emitFirstDockCreated(githubId)
      })
      .catch(function (err) {
        log.error({ err: err }, 'DockerEventsStreamConnected: failed to notify')
        throw new TaskFatalError(
          'docker.events-stream.connected',
          'Failed to create job or send websocket event',
          { job: job }
        )
      })
    })
}
