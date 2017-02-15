'use strict'
require('loadenv')()

const keypather = require('keypather')()
const WebhookService = require('models/services/webhook-service')
const schemas = require('models/rabbitmq/schemas')
const Instance = require('models/mongo/instance')

module.exports.jobSchema = schemas.githubPullRequestEvent

module.exports.task = (job) => {
  const payload = job.payload
  const repo = payload.repository.full_name
  const head = payload.pull_request.head
  const base = payload.pull_request.base
  const branch = head.label
  const githubPushInfo = {
    repo,
    branch,
    repoName: payload.repository.name,
    user: job.payload.sender,
    commitPusher: keypather.get(payload, 'sender.login'),
    commit: head.sha
  }

  if (head.repo.id === base.repo.id) {
    return
  }
  return Instance.findInstancesLinkedToBranchAsync(repo, branch)
    .then(function (instances) {
      return WebhookService.autoFork(instances, githubPushInfo)
    })
}
