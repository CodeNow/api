/**
 * Used as a router to convert disconnected events to dock.removed events
 * @module lib/workers/docker.events-stream.disconnected
 */
'use strict'
require('loadenv')()

var TaskFatalError = require('ponos').TaskFatalError

var rabbitMQ = require('models/rabbitmq')
var logger = require('logger')
var joi = require('utils/joi')

var schema = joi.object({
  host: joi.string().uri({ scheme: 'http' }).required(),
  org: joi.orgId().required()
}).required().label('job')

/**
 * translates docker.events-stream.disconnected to dock.removed
 * @param  {Object}  job    rabbit job object
 * @return {Promise} worker task promise
 */
module.exports = function DockerEventStreamDisconnected (job) {
  var log = logger.child({
    job: job,
    queue: 'docker.events-stream.disconnected',
    tx: true
  })

  return joi.validateOrBoomAsync(job, schema)
    .catch(function (err) {
      throw new TaskFatalError(
        'docker.events-stream.disconnected',
        'Job failed validation',
        { err: err }
      )
    })
    .then(function createNextJob () {
      log.info('dockerEventStreamDisconnected: createNextJob')

      rabbitMQ.publishDockRemoved({
        githubId: parseInt(job.org, 10),
        host: job.host
      })
    })
}
