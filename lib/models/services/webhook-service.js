/**
 * @module lib/models/services/webhook-service
 */
'use strict'

require('loadenv')('models/services/webhook-service')
var Promise = require('bluebird')
var keypather = require('keypather')()
var pluck = require('101/pluck')

var NotImplementedException = require('errors/not-implemented-exception.js')

var BuildService = require('models/services/build-service')
var Instance = require('models/mongo/instance')
var InstanceForkService = require('models/services/instance-fork-service')
var IsolationService = require('models/services/isolation-service')
var MixPanelModel = require('models/apis/mixpanel')
var User = require('models/mongo/user')
var UserWhitelist = require('models/mongo/user-whitelist')
var rabbitMQ = require('models/rabbitmq')

var Boom = require('dat-middleware').Boom
var logger = require('logger')

function WebhookService () {}

WebhookService.logger = logger.child({
  tx: true,
  module: 'WebhookService'
})

module.exports = WebhookService

/**
 * When a branch is deleted, we look for all forked instances with that repo and branch, and delete
 * them.  This should not delete any isolated child instances, since other users may still be using
 * it. Rabbit job 'instance.container.delete' will be created for each instance found
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
  var log = this.logger.child({
    repo: githubPushInfo.repo,
    branch: githubPushInfo.branch,
    method: 'autoDelete'
  })
  log.info('autoDelete called')
  return Instance.findForkedInstancesAsync(githubPushInfo.repo, githubPushInfo.branch)
    .catch(function (err) {
      log.error({
        error: err
      }, 'autoDelete failed to fetch any instances')
      throw err
    })
    .tap(function (instances) {
      if (!instances.length) {
        log.info('autoDelete found no instances to delete')
      }
    })
    .map(function (instance) {
      var instanceId = instance._id.toString()
      rabbitMQ.deleteInstance({
        instanceId: instanceId
      })
      return instanceId
    })
    .tap(function (instancesIds) {
      log.info({
        instanceIds: instancesIds
      }, 'autoDelete deleted instances')
    })
}

/**
 * When a new commit comes through, we need to update all of the existing instances with the given
 * repo and branch.  This list of instances is already given in the input, so all we need to do is
 * filter out all of the locked instances (locked = autoDeploy off), then start the building.  If
 * there are no more instances left, it will log and return an empty array
 *
 * @param   {[Instance]} instances             - instances to be updated to the latest code
 * @param   {Object}     githubPushInfo        - parsed githook data
 * @returns {Null}
 * @throws  {Error}      When any of the instances are missing their createdBy githubId
 *                        + BuildService.createAndBuildContextVersion
 */
WebhookService.autoDeploy = function (instances, githubPushInfo) {
  var log = this.logger.child({
    instanceIds: instances.map(pluck('_id')),
    method: 'autoDeploy'
  })
  log.info('autoDeploy called')

  return Promise.filter(instances, function (instance) {
    return !instance.locked
  })
    .tap(function (instances) {
      if (!instances.length) {
        log.info('autoDelete found no instances to delete')
      }
    })
    .map(function (instance) {
      return BuildService.createAndBuildContextVersion(instance, githubPushInfo, 'autodeploy')
    })
    .catch(function (err) {
      log.error({
        error: err
      }, 'autoDeploy failed to createAndBuildContextVersion')
      throw err
    })
    .return(null)
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
  var log = this.logger.child({
    repo: githubPushInfo.repo,
    branch: githubPushInfo.branch,
    instanceIds: autoDeployedInstances.map(pluck('_id')),
    method: 'autoFork'
  })
  log.info('autoFork called')

  return this.checkCommitPusherIsRunnableUser(githubPushInfo)
    .then(function () {
      return Instance.findMasterPodsToAutoFork(githubPushInfo.repo, githubPushInfo.branch, autoDeployedInstances)
    })
    .catch(function (err) {
      log.error({err: err}, 'error attempting to fetch autoForking candidates')
      throw err
    })
    .then(function (instances) {
      if (instances.length) {
        return InstanceForkService.autoFork(instances, githubPushInfo)
          .catch(function (err) {
            log.error({err: err}, 'error while forking new instances')
            // throw so we don't try to auto-isolate anything
            throw err
          })
          .then(function (newInstances) {
            return IsolationService.autoIsolate(newInstances, githubPushInfo)
              .return(newInstances)
              .catch(function (err) {
                log.error({err: err}, 'error while autoisolating')
                // throw so we don't try to auto-isolate anything
                throw err
              })
          })
      }
      log.info('autoFork found no instances to fork')
      return null
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
  var committerUsername = keypather.get(githubPushInfo, 'commitPusher')
  var log = this.logger.child({
    username: committerUsername,
    method: 'checkCommitPusherIsRunnableUser'
  })
  log.info('checkCommitPusherIsRunnableUser called')

  return Promise.try(function () {
    if (!committerUsername) {
      throw Boom.forbidden('Commit author/committer username is empty')
    }
    return User.findOneAsync({ 'accounts.github.username': committerUsername })
  })
    .catch(function (err) {
      log.error({ err: err }, 'checkCommitPusherIsRunnableUser error')
      throw err
    })
    .tap(function (record) {
      if (!record) {
        var committerNotRunnableUserError = Boom.forbidden(
          'Commit author/commitPusher is not a Runnable user',
          { username: committerUsername }
        )
        log.error(
          { err: committerNotRunnableUserError },
          'checkCommitPusherIsRunnableUser Commit author/commitPusher is not a Runnable user'
        )
        throw committerNotRunnableUserError
      }
      log.trace('checkCommitPusherIsRunnableUser successful (user is Runnable user)')
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
 * @resolves {UserWhitelist}  Org's whitelist entry
 * @throws   {Boom.forbidden} When the org isn't in the whitelist
 * @throws   {Boom.forbidden} When the org's service has been suspended
 * @throws   {Error}          When Mongo fails
 */
WebhookService.checkRepoOrganizationAgainstWhitelist = function (githubPushInfo) {
  var orgName = keypather.get(githubPushInfo, 'repoOwnerOrgName.toLowerCase()')
  var log = this.logger.child({
    orgName: orgName,
    method: 'checkRepoOrganizationAgainstWhitelist'
  })
  log.info('checkRepoOrganizationAgainstWhitelist called')
  return UserWhitelist.findOneAsync({ lowerName: orgName })
    .catch(function (err) {
      log.error({ err: err }, 'Error fetching UserWhitelist')
      throw err
    })
    .tap(function (record) {
      if (!record) {
        log.warn('organization not in whitelist')
        throw Boom.forbidden('Repo owner is not registered on Runnable')
      }
      if (!record.allowed) {
        log.warn('organization in whitelist, but is disallowed')
        throw Boom.forbidden('Your organization has been suspended on Runnable')
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
  var log = this.logger.child({
    method: 'processGithookEvent'
  })
  log.info('processGithookEvent called')

  return this.parseGitHubPushData(payload)
    .tap(this.checkRepoOrganizationAgainstWhitelist)
    .tap(this.reportMixpanelUserPush)
    .tap(function (githubPushInfo) {
      var ref = githubPushInfo.ref
      if (ref && ref.indexOf('refs/tags/') === 0) {
        throw new NotImplementedException('processGithookEvent', 'Cannot handle tags\' related events')
      }
    })
    .then(function (githubPushInfo) {
      if (payload.deleted) {
        return WebhookService.autoDelete(githubPushInfo)
      } else {
        return WebhookService.doAutoDeployAndAutoFork(githubPushInfo)
      }
    })
    .catch(function (err) {
      log.error({
        error: err
      }, 'processGithookEvent failed to AutoDelete, AutoDeploy, or AutoFork')
      throw err
    })
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
 * @returns  {Promise} When all of the instances have either been created, or the jobs have all been created
 * @resolves {Null}
 * @throws   {Error}   When findInstancesLinkedToBranchAsync fails
 * @throws   {Error}   When AutoDeploy fails
 * @throws   {Error}   When AutoFork fails
 */
WebhookService.doAutoDeployAndAutoFork = function (githubPushInfo) {
  var log = this.logger.child({
    method: 'doAutoDeployAndAutoFork'
  })
  log.info('doAutoDeployAndAutoFork called')
  // First, find all of the possible instances with this repo
  return Instance.findInstancesLinkedToBranchAsync(githubPushInfo.repo, githubPushInfo.branch)
    .catch(function (err) {
      log.error({
        error: err
      }, 'doAutoDeployAndAutoFork failed to fetch instances')
      throw err
    })
    .then(function (instances) {
      var promises = [
        WebhookService.autoDeploy(instances, githubPushInfo)
      ]
      if (process.env.ENABLE_AUTOFORK_ON_BRANCH_PUSH) {
        promises.push(WebhookService.autoFork(instances, githubPushInfo))
      }
      return Promise.all(promises)
    })
    .return(null)
    .catch(function (err) {
      log.error({
        error: err
      }, 'doAutoDeployAndAutoFork AutoDeploy or AutoForking failed')
      throw err
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
 * @resolves {GithubPushInfo}  Committer's User model
 * @throws   {Boom.badRequest} When the repository data is missing from the GitHook
 * @throws   {Boom.badRequest} When the ref data is missing from the GitHook
 */
WebhookService.parseGitHubPushData = function (payload) {
  var log = this.logger.child({
    payload: payload,
    method: 'checkCommitPusherIsRunnableUser'
  })
  log.info('checkCommitPusherIsRunnableUser called')
  var repository = keypather.get(payload, 'repository')

  return Promise.try(function () {
    if (!repository) {
      throw Boom.badRequest('Unexpected commit hook format. Repository is required', { payload: payload })
    }
    // headCommit can be null if we are deleting branch
    var headCommit = payload.head_commit || {}
    var ref = payload.ref
    if (!ref) {
      throw Boom.badRequest('Unexpected commit hook format. Ref is required', { payload: payload })
    }
    // Repo owner username can be in the `login` property of the owner if it's a
    // user or in the  `name` property if it's an org
    var repoOwnerOrgName = keypather.get(payload, 'repository.owner.login') ||
      keypather.get(payload, 'repository.owner.name')

    var githubPushInfo = {
      repo: repository.full_name,
      repoName: repository.name,
      repoOwnerOrgName: repoOwnerOrgName,
      branch: ref.replace('refs/heads/', ''),
      commit: headCommit.id,
      commitPusher: keypather.get(payload, 'sender.login'),
      commitLog: payload.commits || [],
      user: payload.sender,
      ref: ref
    }
    log.trace(githubPushInfo, 'parseGitHubPushData githubPushInfo')
    return githubPushInfo
  })
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
  var log = this.logger.child({
    method: 'reportMixpanelUserPush'
  })
  log.info('reportMixpanelUserPush called')

  return User.findByGithubIdAsync(githubPushInfo.user.id)
    .then(function (user) {
      if (user) {
        var mixPanel = new MixPanelModel(user)
        return mixPanel.track('github-push', githubPushInfo)
      }
    })
    .catch(function (err) {
      log.warn({
        error: err
      }, 'MixPanel tracking failed')
      // Don't throw, since we shouldn't stop this event going through because we fucked up
    })
}
