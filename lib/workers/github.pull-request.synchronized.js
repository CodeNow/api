'use strict'
require('loadenv')()

const WebhookService = require('models/services/webhook-service')
const schemas = require('models/rabbitmq/schemas')

module.exports.jobSchema = schemas.githubPullRequestEvent

module.exports.task = (job) => {
  const payload = job.payload
  return WebhookService.processGithookPullRequestSynced(payload)
}
