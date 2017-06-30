'use strict'
require('loadenv')()
const WorkerStopError = require('error-cat/errors/worker-stop-error')

const WebhookService = require('../models/services/webhook-service')
const schemas = require('../models/rabbitmq/schemas')

module.exports.jobSchema = schemas.githubEvent

module.exports.task = (job) => {
  return WebhookService.processGithookEvent(job.payload)
    .catch((err) => {
      if (~err.message.indexOf('User not found')) {
        throw new WorkerStopError('User not found', { err }, { level: 'info' })
      }
    })
}
