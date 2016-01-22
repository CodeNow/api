/**
 * Handle instance container died event
 * @module lib/workers/instance.container.died
 */
'use strict'

require('loadenv')()
var Promise = require('bluebird')
var keypather = require('keypather')()

var InstanceService = require('models/services/instance-service')
var joi = require('utils/joi')
var TaskFatalError = require('ponos').TaskFatalError
var log = require('middlewares/logger')(__filename).log

module.exports = InstanceContainerDiedWorker

/**
 * Handle instance.container.died command
 * Flow is following:
 * 1. find instance
 * 2. update instance
 * 3. emit frontend updates that instance was updated
 * @param {Object} job - Job info
 * @returns {Promise}
 */
function InstanceContainerDiedWorker (job) {
  var logData = {
    tx: true,
    data: job
  }
  var schema = joi.object({
    id: joi.string().required(),
    inspectData: joi.object({
      Config: joi.object({
        Labels: joi.object({
          instanceId: joi.string().required(),
          sessionUserGithubId: joi.number().required(),
          deploymentUuid: joi.string()
        }).unknown().required()
      }).unknown().required()
    }).unknown().required()
  })
  return joi.validateOrBoomAsync(job, schema)
    .catch(function (err) {
      throw new TaskFatalError(
        'instance.container.died',
        'Invalid Job',
        { validationError: err, job: job }
      )
    })
    .then(function (instance) {
      var instanceId = job.inspectData.Config.Labels.instanceId
      return Promise.fromCallback(function (cb) {
        InstanceService.modifyExistingContainerInspect(
          instanceId, job.id, job.inspectData, cb)
      }).catch(function (err) {
        var statusCode = keypather.get(err, 'output.statusCode')
        if (statusCode === 409) {
          var fatalError = new TaskFatalError('instance.container.died', 'Instance not found', { job: job })
          fatalError.level = 'warning'
          throw fatalError
        }
        throw err
      })
    })
    .then(function (instance) {
      log.info(logData, 'instance.container.died - publish frontend updates')
      var sessionUserGithubId = job.inspectData.Config.Labels.sessionUserGithubId
      return InstanceService.emitInstanceUpdate(instance, sessionUserGithubId, 'update', true)
    })
}
