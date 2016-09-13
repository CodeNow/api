/**
 * Used as a router to convert disconnected events to dock.removed events
 * @module lib/workers/docker.events-stream.disconnected
 */
'use strict'
require('loadenv')()

var rabbitMQ = require('models/rabbitmq')
var logger = require('logger')
var joi = require('utils/joi')
var workerUtils = require('utils/worker-utils')

var schema = joi.object({
  host: joi.string().uri({ scheme: 'http' }).required(),
  org: joi.orgId().required()
}).unknown().required().label('docker.events-stream.disconnected job')

/**
 * translates docker.events-stream.disconnected to dock.removed
 * @param  {Object}  job    rabbit job object
 * @return {Promise} worker task promise
 */
module.exports = function DockerEventStreamDisconnected (job) {
  var log = logger.child({ method: 'DockerEventStreamDisconnected' })
  log.info('DockerEventStreamDisconnected called')

  return workerUtils.validateJob(job, schema)
    .then(function createNextJob () {
      log.info('createNextJob')

      rabbitMQ.publishDockRemoved({
        githubId: parseInt(job.org, 10),
        host: job.host
      })
    })
}
