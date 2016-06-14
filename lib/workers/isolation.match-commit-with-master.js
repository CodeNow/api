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
 * Math isolation group master with instances children with same repo/branch
 *
 * Given an isolation group, match the commit of all child instances with the
 * same repo and branch as the isolationGropuMaster with the commit of the
 * isolationGroupMaster. For example, If a group has  2 apis in the group
 * (1 for tests), it will update both of them to the latest when the master
 * is updated.
 *
 * @param   {Object}  job                     - Job info
 * @param   {String}  job.isolationId         - Id of the isolation model
 * @param   {String}  job.repo                - Name of repo
 * @param   {String}  job.branch              - Name of branch
 * @param   {String}  job.commit              - Commit hash for new commit
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
    repo: joi.string().required(),
    commit: joi.string().required(),
    branch: joi.string().required(),
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
      log.trace('Fetching instances')
      return Instance.findInstancesInIsolationWithSameRepoAndBranchAsync(job.isolationId, job.repo, job.branch)
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
            return commit !== job.commit
          })
          return [
            instancesToUpdate,
            User.findByGithubIdAsync(job.sessionUserGithubId),
            job.commit
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

