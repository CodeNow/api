'use strict'
require('loadenv')()

const WebhookService = require('models/services/webhook-service')
const schemas = require('models/rabbitmq/schemas')
const Instance = require('models/mongo/instance')

module.exports.jobSchema = schemas.githubPullRequestEvent

module.exports.task = (job) => {
  const payload = job.payload
  const repo = payload.repository.full_name
  const branch = payload.pull_request.head.label
  const githubPushInfo = {
    repo,
    branch,
    repoName: payload.repository.name,
    user: job.payload.sender
  }
  return Instance.findInstancesLinkedToBranchAsync(repo, branch)
    .then(function (instances) {
      return WebhookService.autoFork(instances, githubPushInfo)
    })
}
