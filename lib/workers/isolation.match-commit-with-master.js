/**
 * Delete context-version when it turns unused
 * @module lib/workers/context-version.delete
 */
'use strict'

// var ContextVersion = require('models/mongo/context-version')
var Instance = require('models/mongo/instance')
var joi = require('utils/joi')
var logger = require('middlewares/logger')(__filename)
// var rabbitMQ = require('models/rabbitmq')
var TaskFatalError = require('ponos').TaskFatalError

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
    isolationId: joi.string().required()
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
      var fullRepoName = masterInstance.contextVersions.appCodeVersions[0].repo
      var commitHash = masterInstance.contextVersions.appCodeVersions[0].commit
      log.trace({
        fullRepoName: fullRepoName,
        commitHash: commitHash
      }, 'Master instance for isolation found. Fetching children')
      return Instance.findIsolationChildrenWithRepo(job.isolationId, fullRepoName)
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
          return childInstances.filter(function (instance) {
            return commitHash !== instance.contextVersions.appCodeVersions[0].commit
          })
        })
    })
    .then(function (childInstancesToUpdate) {
      log.trace({
        instances: childInstancesToUpdate.length
      })
    })
    .catch(function (err) {
      log.trace({
        err: err
      }, 'Error changing commit')
      throw err
    })
}

