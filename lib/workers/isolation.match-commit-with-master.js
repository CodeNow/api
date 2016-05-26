/**
 * Delete context-version when it turns unused
 * @module lib/workers/context-version.delete
 */
'use strict'

var keypather = require('keypather')()
var joi = require('utils/joi')
var TaskFatalError = require('ponos').TaskFatalError

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

      return Promise.map(childInstancesToUpdate, updateInstanceCommitToNewHash.bind(null, commitHash, sessionUser))
    })
    .catch(function (err) {
      log.trace({
        err: err
      }, 'Error changing commit')
      throw err
    })
}

function updateInstanceCommitToNewHash (commit, sessionUser, instance) {
  var log = logger.log.child({
    tx: true,
    commit: commit,
    instanceId: instance._id,
    sessionUser: sessionUser
  })
  log.info('Start updateInstanceCommitToNewHash')
  return ContextVersion.findByIdAsync(instance.contextVersion._id)
    .then(function createDeepCopyOfCV (instanceCV) {
      log.trace({
        instanceCV: instanceCV
      }, 'createDeepCopyOfCV')
      return ContextVersion.createDeepCopyAsync(sessionUser, instanceCV)
    })
    .then(function updateCommitInACV (newCV) {
      log.trace({
        newCV: newCV
      }, 'updateCommitInACV')
      return newCV.modifyAppCodeVersion(newCV.appCodeVersions[0]._id, { commit: commit })
    })
    .then(function createNewBuild (newCV) {
      log.trace({
        newCV: newCV
      }, 'createNewBuild')
      var runnableClient = new Runnable({}, sessionUser)
      var message = 'Commit changed in isolation master'
      return runnableClient.createAndBuildBuildAsync(newCV._id, sessionUser._id, message, newCV)
    })
    .then(function buildNewBuild (newBuild) {
      log.trace({
        newBuild: newBuild
      }, 'createNewBuild')
      var runnableClient = new Runnable({}, sessionUser)
      return runnableClient.buildBuildAsync(newBuild, {})
    })
    .then(function updateInstance (newBuild) {
      log.trace({
        newBuild: newBuild
      }, 'updateInstance')
      var userId = keypather.get(sessionUser, 'accounts.github.id')
      return InstanceService.updateInstanceBuildAsync(instance, { build: newBuild._id }, userId)
    })
    .catch(function errorHandler (err) {
      log.trace({
        err: err
      }, 'error updateInstanceCommitToNewHash')
    })
}
