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


var schema = joi.object({
  host: joi.string().uri({ scheme: 'http' }).required(),
  org: joi.string().regex(/^[0-9]*$/, ['orgId']).required()
}).required().label('job')

/**
 * Handle docker.events-stream.connected event
 * @param  {Object}  job    rabbit job object
 * @return {Promise} worker task promise
 */
module.exports = function DockerEventStreamConnected (job) {
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
      log.info('DockerEventStreamConnected: updateDbFlag')
      return UserWhitelist.updateAsync({
        githubId: parseInt(job.org, 10),
        firstDockCreated: false
      }, {
        $set: {
          firstDockCreated: true
        }
      })
    })
    .then(function (numAffected) {
      log.info({ numAffected: numAffected }, 'number of updated records')
      if (numAffected < 1) {
        throw new TaskFatalError(
          'docker.events-stream.connected',
          'firstDockCreated was set before',
          { report: false, job: job }
        )
      }
      // rabbitMQ.publishAccountReady({
      //   githubId: parseInt(job.org, 10),
      // })
    })
}
