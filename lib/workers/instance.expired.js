'use strict'
var Promise = require('bluebird')

var logger = require('logger')
var rabbitMQ = require('models/rabbitmq')

module.exports = InstanceExpired

/**
 * Handle instance expired event
 * @param {Object} job
 * @param {String} job.instanceId - Instance ID which has been marked as expired
 * @returns {Promise} - Resolves when rabbitMQ delete event has been triggered.
 */
function InstanceExpired (job) {
  var log = logger.child({ method: 'InstanceExpired' })
  log.info('InstanceExpired called')
  return Promise.try(function () {
    rabbitMQ.deleteInstance(job)
  })
}
