'use strict'
require('loadenv')()

const WebhookService = require('models/services/webhook-service')
const schemas = require('models/rabbitmq/schemas')

module.exports.jobSchema = schemas.githubPullRequestEvent

module.exports.task = (job) => {
  return WebhookService.processGithookEvent(job.payload)
}
