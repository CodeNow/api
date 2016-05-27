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
      log.trace({
        masterInstance: masterInstance,
        contextVersion: keypather.get(masterInstance, 'contextVersion'),
        appCodeVersions: keypather.get(masterInstance, 'contextVersion.appCodeVersions'),
        firstACV: keypather.get(masterInstance, 'contextVersion.appCodeVersions[0]')
      }, 'Master instance for isolation found')
      var fullRepoName = keypather.get(masterInstance, 'contextVersion.appCodeVersions[0].repo')
      var commitHash = keypather.get(masterInstance, 'contextVersion.appCodeVersions[0].commit')
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
          if (childInstances.length === 0) {
            log.trace({
              fullRepoName: fullRepoName,
              commitHash: commitHash
            }, 'No children with same repo found. No instances to update.')
            throw new TaskFatalError(
              queueName,
              'No children with same repo found. No instances to update.'
            )
          }
          log.trace({
            fullRepoName: fullRepoName,
            commitHash: commitHash,
            instances: childInstances.length
          }, 'Instances with same repo found')
          // Check in appCodeVersion if commit is different
          return [
            childInstances.filter(function (instance) {
              return commitHash !== keypather.get(instance, 'contextVersion.appCodeVersions[0].commit')
            }),
            User.findByGithubIdAsync(job.sessionUserGithubId),
            commitHash
          ]
        })
    })
    .spread(function (childInstancesToUpdate, sessionUser, commitHash) {
      log.trace({
        instances: childInstancesToUpdate.length
      }, 'Children with same commit found')
      return Promise.map(childInstancesToUpdate, function (instance) {
        log.trace({
          instance: instance,
          funcTypeof: typeof updateInstanceCommitToNewCommit
        }, 'Children updateInstanceCommitToNewHash')
        return updateInstanceCommitToNewCommit(commitHash, sessionUser, instance)
      })
    })
    .catch(function (err) {
      log.trace({
        err: err
      }, 'Error changing commit')
      throw err
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
  return ContextVersion.findByIdAsync(instance.contextVersion._id)
    .then(function (contextVersion) {
      log.trace({
        contextVersion: contextVersion,
        instanceCV: instance.contextVersion
      }, 'Context Version found')
      var acv = contextVersion.appCodeVersions[0]
      var pushInfo = {
        repo: acv.repo,
        branch: acv.branch,
        commit: commit,
        user: {
          id: keypather.get(sessionUser, 'accounts.github.id')
        }
      }
      log.trace({
        acv: acv,
        pushInfo: pushInfo
      }, 'createAndBuildBuildAsync updateInstanceCommitToNewHash')
      return Promise.all([
        BuildService.createNewContextVersion(instance, pushInfo, 'isolate'),
        pushInfo
      ])
    })
    .spread(function newContextVersion (newContextVersion, pushInfo) {
      log.trace({
        newContextVersion: newContextVersion
      }, 'New contextVersion created. Creating and build build. updateInstanceCommitToNewHash')
      var runnable = Runnable.createClient({}, sessionUser)
      var instanceOwnerGithubId = keypather.get(instance, 'owner.github')
      log.trace({
        newCVID: newContextVersion._id.toString(),
        instanceOwnerGithubId: instanceOwnerGithubId,
        data: pick(pushInfo, ['repo', 'branch', 'commit', 'commitLog']),
        createAndBuildBuild: !!runnable.createAndBuildBuild
      }, 'Data. Creating and build build. updateInstanceCommitToNewHash')
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
    .then(function updateInstanceWithNewBuild (newBuild) {
      log.trace({
        newBuild: newBuild
      }, 'updateInstanceWithNewBuild updateInstanceCommitToNewHash')
      var userId = keypather.get(sessionUser, 'accounts.github.id')
      return InstanceService.updateInstanceBuild(instance, { build: newBuild._id }, userId)
    })
    .then(function () {
      var userId = keypather.get(sessionUser, 'accounts.github.id')
      return InstanceService.emitInstatnceUpdate(instance, userId, 'patch')
    })
    .catch(function errorHandler (err) {
      log.trace({
        err: err
      }, 'error updateInstanceCommitToNewHash')
    })
}
