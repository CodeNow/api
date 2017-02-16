'use strict'
require('loadenv')()

const WebhookService = require('models/services/webhook-service')
const schemas = require('models/rabbitmq/schemas')
const Instance = require('models/mongo/instance')

module.exports.jobSchema = schemas.githubPullRequestEvent

module.exports.task = (job) => {
  const payload = job.payload
  if (WebhookService.shouldHandlePullRequestEvent(payload)) {
    const githubPushInfo = WebhookService.parseGitHubPullRequestData(payload)
    return Instance.findInstancesLinkedToBranchAsync(githubPushInfo.repo, githubPushInfo.branch)
      .then(function (instances) {
        return WebhookService.autoFork(instances, githubPushInfo)
      })
  }
}
