/**
 * Delete context-version when it turns unused
 * @module lib/workers/context-version.delete
 */
'use strict'

var keypather = require('keypather')()
var joi = require('utils/joi')
var Promise = require('bluebird')
var pick = require('101/pick')
var TaskFatalError = require('ponos').TaskFatalError

var BuildService = require('models/services/build-service')
var ContextVersion = require('models/mongo/context-version')
var Instance = require('models/mongo/instance')
var InstanceService = require('models/services/instance-service')
var logger = require('middlewares/logger')(__filename)
var User = require('models/mongo/user')
var Runnable = require('models/apis/runnable')

module.exports = MatchCommitWithIsolationGroupMaster
var queueName = 'isolation.match-commit-with-master'

/**
 * Handle context-version.delete command
 * @param {Object} job - Job info
 * @returns {Promise}
 */
function MatchCommitWithIsolationGroupMaster (job) {
  var log = logger.log.child({
    tx: true,
    data: job
  })
  log.info('MatchCommitWithIsolationGroupMaster')

  var schema = joi.object({
    isolationId: joi.string().required(),
    sessionUserGithubId: joi.number().required()
  }).required().label('job')

  return joi.validateOrBoomAsync(job, schema)
    .catch(function (err) {
      throw new TaskFatalError(
        queueName,
        'Invalid Job',
        { validationError: err }
      )
    })
    .then(function () {
      log.trace('Fetching master intance for isolation')
      return Instance.findIsolationMasterAsync(job.isolationId)
    })
    .then(function (masterInstance) {
      var acv = keypather.get(masterInstance, 'contextVersion.appCodeVersions[0]')
      log.trace({
        masterInstance: masterInstance._id,
        acv: acv
      }, 'Master instance for isolation found')
      var fullRepoName = keypather.get(acv, 'repo')
      var commitHash = keypather.get(acv, '.commit')
      if (!fullRepoName || !commitHash) {
        throw new TaskFatalError(
          queueName,
          'Instance does not have repo and/or commit hash',
          { fullRepoName: fullRepoName, commitHash: commitHash }
        )
      }
      log.trace({
        fullRepoName: fullRepoName,
        commitHash: commitHash
      }, 'Fetching children')
      return Instance.findIsolationChildrenWithRepoAsync(job.isolationId, fullRepoName)
        .then(function (childInstances) {
          log.trace({
            instances: childInstances.length
          }, 'Finished fetching child instances')
          if (childInstances.length === 0) {
            log.trace('No children with same repo found. No instances to update.')
            throw new TaskFatalError(
              queueName,
              'No children with same repo found. No instances to update.'
            )
          }
          return [
            childInstances,
            User.findByGithubIdAsync(job.sessionUserGithubId),
            commitHash
          ]
        })
    })
    .spread(function (childInstancesToUpdate, sessionUser, commitHash) {
      log.trace({
        instances: childInstancesToUpdate.length
      }, 'Children with same commit found')
      // TODO: Filter child instances that don't have the same commit
      return Promise.map(childInstancesToUpdate, function (instance) {
        return updateInstanceCommitToNewCommit(commitHash, sessionUser, instance)
      })
    })
    .catch(function (err) {
      log.trace({
        err: err
      }, 'Error changing commit')
      throw new TaskFatalError('Not going to do it')
    })
}

function updateInstanceCommitToNewCommit (commit, sessionUser, instance) {
  var log = logger.log.child({
    tx: true,
    commit: commit,
    instanceId: instance._id,
    sessionUser: sessionUser,
    method: 'updateInstanceCommitToNewHash'
  })
  log.info('Start updateInstanceCommitToNewHash')
  return Promise.try(function () {
    log.trace({
      instanceCV: instance.contextVersion
    }, 'Context Version found')
    var acv = keypather.get(instance.contextVersion, 'appCodeVersions[0]')
    var repo = keypather.get(acv, 'repo')
    var branch = keypather.get(acv, 'branch')
    log.trace({
      acv: acv,
      repo: repo,
      branch: branch
    }, 'Checking repo an branch in old contextVersion')
    if (!repo || !branch) {
      throw new Error('ContextVersion has no repo and/or branch')
    }
    var pushInfo = {
      repo: acv.repo,
      branch: acv.branch,
      commit: commit,
      user: { id: keypather.get(sessionUser, 'accounts.github.id') }
    }
    log.trace({
      acv: acv,
      pushInfo: pushInfo
    }, 'Create new context version')
    return Promise.all([
      BuildService.createNewContextVersion(instance, pushInfo, 'isolate'),
      pushInfo
    ])
  })
    .spread(function newContextVersion (newContextVersion, pushInfo) {
      log.trace({
        newContextVersion: newContextVersion
      }, 'New contextVersion created. Creating and build build')
      var runnable = Runnable.createClient({}, sessionUser)
      var instanceOwnerGithubId = keypather.get(instance, 'owner.github')
      return Promise.fromCallback(function (callback) {
        runnable.createAndBuildBuild(
          newContextVersion._id.toString(),
          instanceOwnerGithubId,
          'isolate',
          pick(pushInfo, ['repo', 'branch', 'commit', 'commitLog']),
          callback
        )
      })
    })
    .tap(function (newBuild) {
      if (!newBuild) {
        throw new TaskFatalError('No New Build')
      }
      var userId = keypather.get(sessionUser, 'accounts.github.id')
      log.trace({
        newBuild: newBuild,
        userId: userId
      }, 'Set new context version')
      var newContextVersionId = newBuild.contextVersions[0]
      return ContextVersion.findByIdAsync(newContextVersionId)
        .then(function (contextVersion) {
          if (!contextVersion) {
            throw new TaskFatalError('ContextVersion in new build not found')
          }
          instance.contextVersion = contextVersion
          return instance.setAsync({
            contextVersion: contextVersion.toJSON()
          })
        })
    })
    .then(function updateInstanceWithNewBuild (newBuild) {
      var userId = keypather.get(sessionUser, 'accounts.github.id')
      log.trace({
        newBuild: newBuild,
        userId: userId
      }, 'updateInstanceWithNewBuild with new build')
      return InstanceService.updateInstanceBuild(instance, { build: newBuild._id }, userId)
    })
    .then(function () {
      log.trace('emitInstanceUpdate')
      var userId = keypather.get(sessionUser, 'accounts.github.id')
      return InstanceService.emitInstanceUpdate(instance, userId, 'patch', true)
    })
}
