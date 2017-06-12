'use strict'
require('loadenv')('models/services/webhook-service')

const errors = require('errors')
const keypather = require('keypather')()
const pluck = require('101/pluck')
const Promise = require('bluebird')

const BuildService = require('models/services/build-service')
const ClusterConfigService = require('models/services/cluster-config-service')
const Instance = require('models/mongo/instance')
const InstanceForkService = require('models/services/instance-fork-service')
const IsolationService = require('models/services/isolation-service')
const logger = require('logger')
const MixPanelModel = require('models/apis/mixpanel')
const rabbitMQ = require('models/rabbitmq')
const User = require('models/mongo/user')
const OrganizationService = require('models/services/organization-service')
const WorkerStopError = require('error-cat/errors/worker-stop-error')

function WebhookService () {}

WebhookService.logger = logger.child({
  module: 'WebhookService'
})

module.exports = WebhookService

/**
 * When a branch is deleted, we look for all forked instances with that repo and branch, and delete
 * them.  This should not delete any isolated child instances, since other users may still be using
 * it. Rabbit job 'container.delete' will be created for each instance found
 *
 * @param {Object} githubPushInfo        - githook data
 * @param {Object} githubPushInfo.repo   - name of the repository that was updated
 * @param {Object} githubPushInfo.branch - name of the branch that was updated
 *
 * @returns  {Promise}        When all of the Rabbit jobs have been created
 * @resolves {[String]|[]}    Array of Instance Ids which were deleted (empty array if none deleted)
 * @throws   {Error}          When the Mongo query fails
 */
WebhookService.autoDelete = function (githubPushInfo) {
  const log = WebhookService.logger.child({
    repo: githubPushInfo.repo,
    branch: githubPushInfo.branch,
    method: 'autoDelete'
  })
  log.info('called')
  return Instance.findNonIsolatedForkedInstances(githubPushInfo.repo, githubPushInfo.branch)
    .tap(function (instances) {
      if (!instances.length) {
        log.info('found no instances to delete')
      }
    })
    .map(function (instance) {
      const instanceId = instance._id.toString()
      rabbitMQ.deleteInstance({ instanceId })
      return instanceId
    })
    .tap(function (instancesIds) {
      log.info({ instancesIds }, 'deleted instances')
    })
}

/**
 * Given an instance, this will update it's Docker Compose cluster if the file has changed, or it will
 * just autoDeploy the instance like normal
 * @param   {Instance} instance        - instance to be updated
 * @param   {Object}   githubPushInfo  - parsed githook data
 * @returns {Promise.<T>}
 */
WebhookService.updateComposeOrAutoDeploy = function (instance, githubPushInfo) {
  const log = WebhookService.logger.child({
    instanceId: instance._id.toString(),
    repo: githubPushInfo.repo,
    branch: githubPushInfo.branch,
    commit: githubPushInfo.commit,
    method: 'updateComposeOrAutoDeploy'
  })
  log.info('called')
  return ClusterConfigService.checkFileChangeAndCreateUpdateJob(instance, githubPushInfo)
    .catch((err) => {
      log.warn({ err }, 'Cluster could not be checked or updated')
      return BuildService.createAndBuildContextVersion(instance, githubPushInfo, 'autodeploy')
    })
}

/**
 * When a new commit comes through, we need to update all of the existing instances with the given
 * repo and branch.  This list of instances is already given in the input, so all we need to do is
 * filter out all of the locked instances (locked = autoDeploy off), then start the building.  If
 * there are no more instances left, it will log and return an empty array
 *
 * @param    {[Instance]} instances             - instances to be updated to the latest code
 * @param    {Object}     githubPushInfo        - parsed githook data
 *
 * @returns  {Promise}  When each instance has started a new cv building
 * @resolves {[Object]} Array of objects containing the new builds, cvs, and user model for
 *                        each instance
 * @throws   {Error}    When any of the instances are missing their createdBy githubId
 *                        + BuildService.createAndBuildContextVersion
 */
WebhookService.autoDeploy = function (instances, githubPushInfo) {
  const log = WebhookService.logger.child({
    instanceIds: instances.map(pluck('_id')),
    repo: githubPushInfo.repo,
    branch: githubPushInfo.branch,
    commit: githubPushInfo.commit,
    method: 'autoDeploy'
  })
  log.info('called')

  instances = instances.filter(function (instance) {
    return !instance.locked
  })
  if (!instances.length) {
    log.info('found no instances to deploy')
  }
  return Promise.map(instances, instance => {
    return WebhookService.updateComposeOrAutoDeploy(instance, githubPushInfo)
  })
}

/**
 * When a new container needs to be generated for a branch, we need to fork the MasterPods which have
 * the given repo and branch.  First, we only want Runnable User branch creation to cause an autoFork.
 * Once we verify that, we fetch all the forkable MasterPods, given an array of contextIds. Since
 * a contextId is shared by all instances which are forked from the MasterPod,we can find which need
 * to be forked by filtering by those contextIds.  Any contextId that isn't in the given array
 * means it's MasterPod doesn't have a child instance with this branch, so fork it. Isolated children
 * do not count
 *
 * @param {[String]} autoDeployedInstances - instances with this repo and branch whose
 *                                              masterPod SHOULD NOT be forked
 * @param {Object}   githubPushInfo        - githook data
 * @param {Object}   githubPushInfo.repo   - name of the repository that was updated
 * @param {Object}   githubPushInfo.branch - name of the branch that was updated
 *
 * @returns  {Promise}         When all of the instances have been created, and auto-isolated
 * @resolves {[Instance]|Null} Newly created auto-forked Instances (null when no instances forked)
 * @throws   {Error}           When autoForking fails
 * @throws   {Error}           When autoIsolation fails
 */
WebhookService.autoFork = function (autoDeployedInstances, githubPushInfo) {
  const log = WebhookService.logger.child({
    repo: githubPushInfo.repo,
    branch: githubPushInfo.branch,
    instanceIds: autoDeployedInstances.map(pluck('_id')),
    method: 'autoFork'
  })
  log.info('called')

  return WebhookService.checkCommitPusherIsRunnableUser(githubPushInfo)
    .then(function () {
      return Instance.findMasterPodsToAutoFork(githubPushInfo.repo, githubPushInfo.branch, autoDeployedInstances)
    })
    .catch(function (err) {
      log.error({ err }, 'error attempting to fetch autoForking candidates')
      throw err
    })
    .then(function (instances) {
      if (!instances.length) {
        log.info('found no instances to fork')
        return null
      }
      return InstanceForkService.autoFork(instances, githubPushInfo)
        .tap(function (newInstances) {
          return IsolationService.autoIsolate(newInstances, githubPushInfo)
        })
        .each(newInstance =>
          ClusterConfigService.checkFileChangeAndCreateUpdateJob(newInstance, githubPushInfo)
            .catch(err => {
              log.warn({ err }, 'Cluster could not be checked or updated')
            })
        )
    })
}

/**
 * Checks if commitPusher is a Runnable user.
 * We don't want to create create new containers for branches when the committer is not in our
 * system, so we check if the name exists in our database
 *
 * @param {Object} githubPushInfo              - githook data
 * @param {Object} githubPushInfo.commitPusher - username of the sender of the commit
 *
 * @returns  {Promise}        When the owner org has been validated
 * @resolves {User}           Committer's User model
 * @throws   {Boom.forbidden} When there is no username for the committer
 * @throws   {Boom.forbidden} When the committer is not a Runnable user
 * @throws   {Error}          When Mongo fails
 */
WebhookService.checkCommitPusherIsRunnableUser = function (githubPushInfo) {
  const isPrivateRepo = keypather.get(githubPushInfo, 'repository.private')
  const committerUsername = keypather.get(githubPushInfo, 'commitPusher')
  const log = WebhookService.logger.child({
    username: committerUsername,
    method: 'checkCommitPusherIsRunnableUser'
  })
  log.info('called')
  if (isPrivateRepo === false) {
    return Promise.resolve()
  }
  return Promise.try(function () {
    if (!committerUsername) {
      throw new WorkerStopError('Committer username is empty', {}, { level: 'info' })
    }
    return User.findOneAsync({ 'accounts.github.username': committerUsername })
  })
    .tap(function (record) {
      if (!record) {
        log.error({ username: committerUsername }, 'Committer is not a Runnable user')
        throw new WorkerStopError('Committer is not a Runnable user', { username: committerUsername }, { level: 'info' })
      }
      log.trace('successful (user is Runnable user)')
    })
}

/**
 * Checks if repo owner org is whitelisted.
 * We don't want to allow unwhitelisted org (repo owner) to create containers.
 * The repo owner might no longer be a whitelisted org and we might still be
 * receiving their webhooks.
 *
 * @param {Object} githubPushInfo                  - githook data
 * @param {Object} githubPushInfo.repoOwnerOrgName - name of the repository that was updated
 *
 * @returns  {Promise}        When the owner org has been validated
 * @resolves {Organization}   Organization entry
 * @throws   {Boom.forbidden} When the org isn't in the whitelist
 * @throws   {Boom.forbidden} When the org's service has been suspended
 * @throws   {Error}          When Mongo fails
 */
WebhookService.checkRepoOrganizationAgainstWhitelist = function (githubPushInfo) {
  const orgGithubName = keypather.get(githubPushInfo, 'repoOwnerOrgName')
  const log = WebhookService.logger.child({
    orgGithubName,
    method: 'checkRepoOrganizationAgainstWhitelist'
  })
  log.info('called')
  return OrganizationService.getByGithubUsername(orgGithubName)
    .catch(errors.OrganizationNotFoundError, function (err) {
      log.warn('Github organization is not a Runnable organization', {
        originalError: err
      })
      throw new WorkerStopError('Repo owner is not registered on Runnable', { originalError: err }, { level: 'info' })
    })
    .tap(function (record) {
      if (!record.allowed) {
        log.warn('organization in whitelist, but is disallowed')
        throw new WorkerStopError('Organization has been suspended on Runnable', { model: record }, { level: 'info' })
      }
    })
}

/**
 * Processes a valid GitHook request. Parses the event for good data, checks the org is allowed,
 * checks that the tags are good, then fires the correct action for this event
 *
 * @param   {Object}  payload         - payload from the GitHook event request
 * @param   {Boolean} payload.deleted - this event is for a branch deleted
 *
 * @returns  {Promise}                 When all of the required jobs for this event have been created
 * @resolves [{String}]                Ids of successful changes (instanceIds, cv ids)
 * @throws   {Error}                   When parseGitHubPushData fails
 * @throws   {Boom.badRequest}         When parseGitHubPushData throws
 * @throws   {Error}                   When checkRepoOrganizationAgainstWhitelist fails
 * @throws   {Boom.forbidden}          When checkRepoOrganizationAgainstWhitelist throws
 * @throws   {Error}                   When autoDelete fails
 * @throws   {Error}                   When doAutoDeployAndAutoFork fails
 * @throws   {NotImplementedException} When ENABLE_AUTOFORK_ON_BRANCH_PUSH is turned off
 */
WebhookService.processGithookEvent = function (payload) {
  const log = WebhookService.logger.child({
    method: 'processGithookEvent'
  })
  log.info('called')

  return WebhookService.parseGitHubPushData(payload)
    .then((githubPushInfo) => {
      return WebhookService.checkRepoOrganizationAgainstWhitelist(githubPushInfo)
        .then((organization) => {
          githubPushInfo.organizationId = organization.id
          return githubPushInfo
        })
    })
    .tap(WebhookService.reportMixpanelUserPush)
    .tap((githubPushInfo) => {
      const ref = githubPushInfo.ref
      if (ref && ref.indexOf('refs/tags/') === 0) {
        throw new WorkerStopError('Cannot handle tags\' related events', {}, { level: 'info' })
      }
    })
    .then(function (githubPushInfo) {
      if (payload.deleted) {
        return WebhookService.autoDelete(githubPushInfo)
      } else {
        return WebhookService.doAutoDeployAndAutoFork(githubPushInfo)
      }
    })
}

WebhookService._processGithookPullRequestEvent = function (payload, processFn) {
  if (!WebhookService.shouldHandlePullRequestEvent(payload)) {
    return Promise.resolve()
  }
  return WebhookService.parseGitHubPullRequestData(payload)
    .tap(WebhookService.checkRepoOrganizationAgainstWhitelist)
    .tap(WebhookService.reportMixpanelUserPush)
    .then((githubPushInfo) => {
      return Instance.findInstancesLinkedToBranchAsync(githubPushInfo.repo, githubPushInfo.branch)
        .then(function (instances) {
          return processFn(instances, githubPushInfo)
        })
    })
}

WebhookService.processGithookPullRequestOpened = function (payload) {
  return WebhookService._processGithookPullRequestEvent(payload, WebhookService.autoFork)
}

WebhookService.processGithookPullRequestSynced = function (payload) {
  return WebhookService._processGithookPullRequestEvent(payload, WebhookService.autoDeploy)
}

/**
 * When a commit is made, we need to do 2 things:
 *
 *  1. AutoDeploy all existing instances that share the provided repo and branch
 *  2. AutoFork any MasterPod with this Repo that doesn't have a child with this branch.
 *
 * We first find all of the instances that have this repo and branch, which should return an array of
 * instances which can be MasterPods, branch containers, or isolated.  Of these, we extract out each
 * unique contextId.  Since a contextId is shared by all instances which are forked from the MasterPod,
 * we can find which need to be forked by filtering by those contextIds.  Any contextId that isn't
 * found in findInstancesLinkedToBranchAsync means it's MasterPod doesn't have a child instance with
 * this branch, so fork it.  Isolated children do not count
 *
 * @param    {Object}   githubPushInfo        - githook data
 * @param    {Object}   githubPushInfo.repo   - name of the repository that was updated
 * @param    {Object}   githubPushInfo.branch - name of the branch that was updated
 *
 * @returns  {Promise}  When all of the instances have either been created, or the jobs have all been created
 * @resolves {[Object]} Array with autoDeploy results as [0] and autoFork at [1]
 * @throws   {Error}    When findInstancesLinkedToBranchAsync fails
 * @throws   {Error}    When AutoDeploy fails
 * @throws   {Error}    When AutoFork fails
 */
WebhookService.doAutoDeployAndAutoFork = function (githubPushInfo) {
  const log = WebhookService.logger.child({
    method: 'doAutoDeployAndAutoFork'
  })
  log.info('called')
  // First, find all of the possible instances with this repo
  return Instance.findInstancesLinkedToBranchAsync(githubPushInfo.repo, githubPushInfo.branch)
    .then(function (instances) {
      const promises = [
        WebhookService.autoDeploy(instances, githubPushInfo)
      ]
      if (process.env.ENABLE_AUTOFORK_ON_BRANCH_PUSH) {
        promises.push(WebhookService.autoFork(instances, githubPushInfo))
      }
      return Promise.all(promises)
    })
}

/**
 * Parses the payload from the GitHook for all of the data we need to make decisions later
 *
 * @param    {Object}   payload                            - body data from the GitHook
 * @param    {[Object]} payload.commits                    - recent commits in this event
 * @param    {Object}   payload.head_commit                - the latest commit that was pushed (null if delete)
 * @param    {Object}   payload.head_commit.id             - id of the commit
 * @param    {Object}   payload.head_commit.committer.name - username of the committer
 * @param    {String}   payload.pusher.name                - username of the pusher
 * @param    {Object}   payload.ref                        - the full Git ref that was pushed
 * @param    {String}   payload.repository                 - username of the committer (or pusher)
 * @param    {Object}   payload.repository.full_name       - full name of repo 'username/repoName'
 * @param    {Object}   payload.repository.name            - name of just the repo
 * @param    {Object}   payload.repository.owner           - owner of the repo (User || Org)
 * @param    {String}   payload.repository.owner.login     - username of owner of the repo (User)
 * @param    {String}   payload.repository.owner.name      - username of owner of the repo (Org)
 * @param    {Object}   payload.sender                     - sender of the event
 *
 * @returns  {Promise}         When the owner org has been validated
 * @resolves {GithubPushInfo}  normalized push info
 * @throws   {Boom.badRequest} When the repository data is missing from the GitHook
 * @throws   {Boom.badRequest} When the ref data is missing from the GitHook
 */
WebhookService.parseGitHubPushData = function (payload) {
  const log = WebhookService.logger.child({
    method: 'parseGitHubPushData'
  })
  log.info('called')

  return Promise.try(function () {
    const repository = payload.repository
    // headCommit can be null if we are deleting branch
    const headCommit = payload.head_commit || {}
    const ref = payload.ref

    // Repo owner username can be in the `login` property of the owner if it's a
    // user or in the  `name` property if it's an org
    const repoOwnerOrgName = keypather.get(payload, 'repository.owner.login') || keypather.get(payload, 'repository.owner.name')
    const repoOwnerOrgId = keypather.get(payload, 'repository.owner.id')

    const githubPushInfo = {
      repo: repository.full_name,
      repoName: repository.name,
      repoOwnerOrgName: repoOwnerOrgName,
      repoOwnerOrgId: repoOwnerOrgId,
      branch: ref.replace('refs/heads/', ''),
      commit: headCommit.id,
      commitPusher: keypather.get(payload, 'sender.login'),
      commitLog: payload.commits || [],
      user: payload.sender,
      ref: ref,
      pullRequest: null
    }
    log.trace(githubPushInfo, 'parseGitHubPushData githubPushInfo')
    return githubPushInfo
  })
}

/**
 * Parses the payload from the GitHook for all of the data we need to make decisions later
 *
 * @param    {Object}   payload                            - body data from the GitHook
 * @param    {[Object]} payload.commits                    - recent commits in this event
 * @param    {Object}   payload.head_commit                - the latest commit that was pushed (null if delete)
 * @param    {Object}   payload.head_commit.id             - id of the commit
 * @param    {Object}   payload.head_commit.committer.name - username of the committer
 * @param    {String}   payload.pusher.name                - username of the pusher
 * @param    {Object}   payload.ref                        - the full Git ref that was pushed
 * @param    {String}   payload.repository                 - username of the committer (or pusher)
 * @param    {Object}   payload.repository.full_name       - full name of repo 'username/repoName'
 * @param    {Object}   payload.repository.name            - name of just the repo
 * @param    {Object}   payload.repository.owner           - owner of the repo (User || Org)
 * @param    {String}   payload.repository.owner.login     - username of owner of the repo (User)
 * @param    {String}   payload.repository.owner.name      - username of owner of the repo (Org)
 * @param    {Object}   payload.sender                     - sender of the event
 *
 * @returns  {Promise}         When the owner org has been validated
 * @resolves {GithubPushInfo}  normalized push info
 * @throws   {Boom.badRequest} When the repository data is missing from the GitHook
 */
WebhookService.parseGitHubPullRequestData = function (payload) {
  const log = WebhookService.logger.child({
    method: 'parseGitHubPullRequestData'
  })
  log.info('called')

  return Promise.try(function () {
    const repository = payload.repository
    const head = payload.pull_request.head
    const branch = head.label
    // Repo owner username can be in the `login` property of the owner if it's a
    // user or in the  `name` property if it's an org
    const repoOwnerOrgName = keypather.get(payload, 'repository.owner.login') || keypather.get(payload, 'repository.owner.name')
    const repoOwnerOrgId = keypather.get(payload, 'repository.owner.id')
    const githubPushInfo = {
      repo: repository.full_name,
      repoName: repository.name,
      repoOwnerOrgName: repoOwnerOrgName,
      repoOwnerOrgId: repoOwnerOrgId,
      branch,
      user: payload.sender,
      commitPusher: keypather.get(payload, 'head_commit.committer.username') || keypather.get(payload, 'sender.login'),
      commit: head.sha,
      commitLog: [],
      pullRequest: payload.number
    }
    return githubPushInfo
  })
}
/**
 * Check if we should to auto launch or autodeploy for this PR: that is check if head and base belong to the same repo.
 * @param  {Object}   payload - githook payload data
 * @returns {Boolean} returns true if PR comes from forked repo.
 */
WebhookService.shouldHandlePullRequestEvent = function (payload) {
  const headRepoId = keypather.get(payload, 'pull_request.head.repo.id')
  const baseRepoId = keypather.get(payload, 'pull_request.base.repo.id')
  return headRepoId !== baseRepoId
}

/**
 * Report to mixpanel event - user pushed to a repository branch
 * Must be invoked after parseGitHubPushData

 * @param    {Object}   githubPushInfo        - githook data
 * @param    {Object}   githubPushInfo.repo   - name of the repository that was updated
 * @param    {Object}   githubPushInfo.branch - name of the branch that was updated
 *
 * @returns  {Promise}  When all of the Rabbit jobs have been created
 * @resolves {Null}
 */
WebhookService.reportMixpanelUserPush = function (githubPushInfo) {
  const log = WebhookService.logger.child({
    method: 'reportMixpanelUserPush'
  })
  log.info('called')

  return User.findByGithubIdAsync(githubPushInfo.user.id)
    .then(function (user) {
      if (user) {
        const mixPanel = new MixPanelModel(user)
        return mixPanel.track('github-push', githubPushInfo)
      }
    })
    .catch(function (err) {
      log.warn({ err }, 'MixPanel tracking failed')
      // Don't throw, since we shouldn't stop this event going through because we fucked up
    })
}
