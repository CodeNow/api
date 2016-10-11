/**
 * Used as a router to convert disconnected events to dock.removed events
 * @module lib/workers/docker.events-stream.disconnected
 */
'use strict'
require('loadenv')()

const Promise = require('bluebird')
const rabbitMQ = require('models/rabbitmq')
const joi = require('utils/joi')

module.exports.jobSchema = joi.object({
  host: joi.string().uri({ scheme: 'http' }).required(),
  org: joi.orgId().required()
}).unknown().required()

/**
 * translates docker.events-stream.disconnected to dock.removed
 * @param  {Object}  job    rabbit job object
 * @return {Promise} worker task promise
 */
module.exports.task = (job) => {
  return Promise.try(() => {
    rabbitMQ.publishDockRemoved({
      githubOrgId: parseInt(job.org, 10),
      host: job.host
    })
  })
}
