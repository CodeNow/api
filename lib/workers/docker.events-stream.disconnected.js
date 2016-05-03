/**
 * Used as a router to convert disconnected events to dock.removed events
 * @module lib/workers/docker.events-stream.disconnected
 */
'use strict'
require('loadenv')()

var TaskFatalError = require('ponos').TaskFatalError

var rabbitMQ = require('models/rabbitmq')
var logger = require('middlewares/logger')(__filename).log
var joi = require('utils/joi')

/**
 * translates docker.events-stream.disconnected to dock.removed
 * @return {Promise} worker task promise
 */
module.exports = function dockerEventStreamDisconnected (job) {
  var log = logger.child({
    job: job,
    queue: 'docker.events-stream.disconnected',
    tx: true
  })

  var schema = joi.object({
    host: joi.string().uri({ scheme: 'http' }).required(),
    org: joi.string().regex(/^[0-9]*$/, ['orgId']).required()
  }).required().label('job')

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
