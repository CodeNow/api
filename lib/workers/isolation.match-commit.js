/**
 * Handle 'isolation.match-commit' command
 * @module lib/workers/isolation.match-commit
 */
'use strict'

const keypather = require('keypather')()
const joi = require('utils/joi')
const Promise = require('bluebird')
const WorkerStopError = require('error-cat/errors/worker-stop-error')

const Instance = require('models/mongo/instance')
const ContextVersion = require('models/mongo/context-version')
const InstanceService = require('models/services/instance-service')
const logger = require('logger')
const User = require('models/mongo/user')
const workerUtils = require('utils/worker-utils')

module.exports.jobSchema = joi.object({
  isolationId: joi.string().required(),
  instanceId: joi.string().required(),
  sessionUserGithubId: joi.number().required()
}).unknown().required().label('isolation.match-commit job')

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
module.exports.task = function MatchCommitInIsolationInstances (job) {
  const log = logger.child({ method: 'MatchCommitInIsolationInstances' })
  return Instance.findByIdAsync(job.instanceId)
    .tap(workerUtils.assertFound(job, 'Instance', { instanceId: job.instanceId }))
    .then(function (instanceToMatch) {
      if (instanceToMatch.isolated.toString() !== job.isolationId) {
        throw new WorkerStopError(
          'Instance does not have the isolation that needs to matched',
          { instanceIsolation: instanceToMatch.isolated.toString() }
        )
      }
      const appCodeVersions = keypather.get(instanceToMatch.contextVersion, 'appCodeVersions')
      const acv = ContextVersion.getMainAppCodeVersion(appCodeVersions)
      log.trace({
        instanceToMatch: instanceToMatch._id,
        acv: acv
      }, 'Instance for which commit will be matched was found')
      const fullRepoName = keypather.get(acv, 'repo')
      const commitHash = keypather.get(acv, 'commit')
      const branchName = keypather.get(acv, 'branch')
      if (!fullRepoName || !commitHash) {
        throw new WorkerStopError(
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
            throw new WorkerStopError(
              'No instances with same repo found. No instances to update.'
            )
          }
          // Filter all instances that already have this commit
          const instancesToUpdate = instances.filter(function (instance) {
            const appCodeVersions = keypather.get(instance.contextVersion, 'appCodeVersions')
            const acv = ContextVersion.getMainAppCodeVersion(appCodeVersions)
            const commit = keypather.get(acv, 'commit')
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
        const instanceId = instance._id.toString()
        log.trace({
          instanceId: instanceId
        }, 'updateInstanceCommitToNewCommit for child instance')
        return InstanceService.updateInstanceCommitToNewCommit(instance, commitHash, sessionUser)
          .catch(function (err) {
            log.warn({
              instanceId: instanceId,
              err: err
            }, 'Failed to updateInstanceCommitToNewCommit for child instance')
            if (err.isBoom && err.output.statusCode === 404) {
              throw new WorkerStopError(
                'Failed to match commits. Some entities were removed', {
                  err: err,
                  instanceId: instanceId
                }
              )
            }
            throw err
          })
      })
    })
}
