/**
 * Handle 'isolation.match-commit' command
 * @module lib/workers/isolation.match-commit
 */
'use strict'

var keypather = require('keypather')()
var joi = require('utils/joi')
var Promise = require('bluebird')
var TaskFatalError = require('ponos').TaskFatalError

var Instance = require('models/mongo/instance')
var ContextVersion = require('models/mongo/context-version')
var InstanceService = require('models/services/instance-service')
var logger = require('middlewares/logger')(__filename)
var User = require('models/mongo/user')

module.exports = MatchCommitInIsolationInstances
var queueName = 'isolation.match-commit'

/**
 * Math commit in all instances in an isolation with the same repo/branch
 *
 * Given an isolation group, match the commit of all instances with the
 * same repo and branch as the commit of the given instance.  For example, If
 * a group has 2 apis in the group  (1 for tests), it will update both of them
 * to the latest when any of these instances are updated.
 *
 * @param   {Object}  job                     - Job info
 * @param   {String}  job.isolationId         - Id of the isolation model
 * @param   {String}  job.instanceId          - Id of the instance to match commits for
 * @param   {Number}  job.sessionUserGithubId - GitHub ID of the session user
 * @returns {Promise}
 */
function MatchCommitInIsolationInstances (job) {
  var log = logger.log.child({
    tx: true,
    data: job,
    method: 'MatchCommitInIsolationInstances'
  })
  log.info('call')

  var schema = joi.object({
    isolationId: joi.string().required(),
    instanceId: joi.string().required(),
    sessionUserGithubId: joi.number().required()
  }).required().label('job')

  return joi.validateOrBoomAsync(job, schema)
    .catch(function (err) {
      throw new TaskFatalError(
        queueName,
        'Invalid Job Data',
        { validationError: err }
      )
    })
    .then(function () {
      log.trace('Fetching intance in isolation that needs to be matched')
      return Instance.findByIdAsync(job.instanceId)
    })
    .then(function (instanceToMatch) {
      if (instanceToMatch.isolated.toString() !== job.isolationId) {
        throw new TaskFatalError(
          queueName,
          'Instance does not have the isolation that needs to matched',
          { instanceIsolation: instanceToMatch.isolated.toString() }
        )
      }
      var appCodeVersions = keypather.get(instanceToMatch.contextVersion, 'appCodeVersions')
      var acv = ContextVersion.getMainAppCodeVersion(appCodeVersions)
      log.trace({
        instanceToMatch: instanceToMatch._id,
        acv: acv
      }, 'Instance for which commit will be matched was found')
      var fullRepoName = keypather.get(acv, 'repo')
      var commitHash = keypather.get(acv, 'commit')
      var branchName = keypather.get(acv, 'branch')
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
      }, 'Fetching instances')
      return Instance.findInstancesInIsolationWithSameRepoAndBranchAsync(job.isolationId, fullRepoName, branchName)
        .then(function (instances) {
          log.trace({
            instances: instances.length
          }, 'Finished fetching instances')
          if (instances.length === 0) {
            log.trace('No instances with same repo found. No instances to update.')
            throw new TaskFatalError(
              queueName,
              'No instances with same repo found. No instances to update.'
            )
          }
          // Filter all instances that already have this commit
          var instancesToUpdate = instances.filter(function (instance) {
            var appCodeVersions = keypather.get(instance.contextVersion, 'appCodeVersions')
            var acv = ContextVersion.getMainAppCodeVersion(appCodeVersions)
            var commit = keypather.get(acv, 'commit')
            return commit !== commitHash
          })
          return [
            instancesToUpdate,
            User.findByGithubIdAsync(job.sessionUserGithubId),
            commitHash
          ]
        })
    })
    .spread(function (childInstancesToUpdate, sessionUser, commitHash) {
      log.trace({
        instances: childInstancesToUpdate.length
      }, 'instances with same commit found')
      return Promise.map(childInstancesToUpdate, function (instance) {
        log.trace({
          instanceId: instance._id.toString()
        }, 'updateInstanceCommitToNewCommit for child instance')
        return InstanceService.updateInstanceCommitToNewCommit(instance, commitHash, sessionUser)
          .catch(function (err) {
            log.warn({
              instanceId: instance._id.toString(),
              err: err
            }, 'Failed to updateInstanceCommitToNewCommit for child instance')
            throw err
          })
      })
    })
}

