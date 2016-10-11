/**
 * Used as a router to convert disconnected events to dock.removed events
 * @module lib/workers/docker.events-stream.disconnected
 */
'use strict'
require('loadenv')()

const rabbitMQ = require('models/rabbitmq')
const logger = require('logger')
const joi = require('utils/joi')
const workerUtils = require('utils/worker-utils')

const schema = joi.object({
  host: joi.string().uri({ scheme: 'http' }).required(),
  org: joi.orgId().required()
}).unknown().required().label('docker.events-stream.disconnected job')

/**
 * translates docker.events-stream.disconnected to dock.removed
 * @param  {Object}  job    rabbit job object
 * @return {Promise} worker task promise
 */
module.exports = function DockerEventStreamDisconnected (job) {
  const log = logger.child({ method: 'DockerEventStreamDisconnected' })

  return workerUtils.validateJob(job, schema)
    .then(function createNextJob () {
      log.info('createNextJob')

      rabbitMQ.publishDockRemoved({
        githubOrgId: parseInt(job.org, 10),
        host: job.host
      })
    })
}
