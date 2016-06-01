/**
 * Handle 'isolation.match-commit-with-master' command
 * @module lib/workers/isolation.match-commit-with-master
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

module.exports = MatchCommitWithIsolationGroupMaster
var queueName = 'isolation.match-commit-with-master'

/**
 * Math isolation group master with children instances with same repo/branch
 *
 * Given an isolation group, match the commit of all child instances with the
 * same repo and branch as the isolationGropuMaster with the commit of the
 * isolationGroupMaster. For example, If a group has  2 apis in the group
 * (1 for tests), it will update both of them to the latest when the master
 * is updated.
 *
 * @param   {Object}  job                     - Job info
 * @param   {String}  job.isolationId         - Id of the isolation model
 * @param   {Number}  job.sessionUserGithubId - GitHub ID of the session user
 * @returns {Promise}
 */
function MatchCommitWithIsolationGroupMaster (job) {
  var log = logger.log.child({
    tx: true,
    data: job,
    method: 'MatchCommitWithIsolationGroupMaster'
  })
  log.info('call')

  var schema = joi.object({
    isolationId: joi.string().required(),
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
      log.trace('Fetching master intance for isolation')
      return Instance.findIsolationMasterAsync(job.isolationId)
    })
    .then(function (masterInstance) {
      var appCodeVersions = keypather.get(masterInstance.contextVersion, 'appCodeVersions')
      var acv = ContextVersion.getMainAppCodeVersion(appCodeVersions)
      log.trace({
        masterInstance: masterInstance._id,
        acv: acv
      }, 'Master instance for isolation found')
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
          // Filter all instances that already have this commit
          var childInstancesToUpdate = childInstances.filter(function (instance) {
            var appCodeVersions = keypather.get(instance.contextVersion, 'appCodeVersions')
            var acv = ContextVersion.getMainAppCodeVersion(appCodeVersions)
            var commit = keypather.get(acv, 'commit')
            var branch = keypather.get(acv, 'branch')
            return commit !== commitHash && branch === branchName
          })
          return [
            childInstancesToUpdate,
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

