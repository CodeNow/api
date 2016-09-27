/**
 * Manage starting a build container (and save it to the context version)
 *
 * @module lib/workers/container.image-builder.started
 */
'use strict'
require('loadenv')()

var ContextVersion = require('models/mongo/context-version')
var joi = require('utils/joi')
var InstanceService = require('models/services/instance-service')
var logger = require('logger')
var messenger = require('socket/messenger')
var WorkerStopError = require('error-cat/errors/worker-stop-error')

module.exports = ContainerImageBuilderStarted

var schema = joi.object({
  inspectData: joi.object({
    Config: joi.object({
      Labels: joi.object({
        'contextVersion.build._id': joi.string().required()
      }).unknown().required()
    }).unknown().required()
  }).unknown().required(),
  tid: joi.string()
}).unknown().required().label('container.image-builder.started job')

/**
 * update database with new started state information
 * 1. validate job
 * 2. find cv with desired state and update
 * 3. validate cv was updated (if not, cv was in incorrect state to move forward)
 * 4. on success, emit updated event for all cv's with this build
 * @param  {Object} job worker job
 * @return {Promise} worker task promise
 */
function ContainerImageBuilderStarted (job) {
  var log = logger.child({ method: 'ContainerImageBuilderStarted' })
  log.info('ContainerImageBuilderStarted called')
  return joi
    .validateOrBoomAsync(job, schema)
    .catch(function (err) {
      throw new WorkerStopError(
        'validation failed',
        { job: job, err: err }
      )
    })
    .then(function updateContextVersion () {
      var contextVersionBuildId = job.inspectData.Config.Labels['contextVersion.build._id']
      var query = {
        'build._id': contextVersionBuildId,
        state: ContextVersion.states.buildStarting
      }
      var update = {
        $set: {
          'build.containerStarted': new Date(),
          state: ContextVersion.states.buildStarted
        }
      }
      log.trace({ query: query, update: update }, 'updateContextVersion')
      // need to update all cv's with this build for dedupe logic to work
      return ContextVersion.updateAsync(query, update, { multi: true })
    })
    .then(function validateUpdate (updatedCount) {
      log.trace({ updatedCount: updatedCount }, 'validateUpdate')

      if (updatedCount === 0) {
        throw new WorkerStopError(
          'ContextVersion was not updated',
          { job: job }, { level: 'info' })
      }
    })
    .then(function findContextVersions () {
      var contextVersionBuildId = job.inspectData.Config.Labels['contextVersion.build._id']
      var query = {
        'build._id': contextVersionBuildId,
        'state': ContextVersion.states.buildStarted
      }
      return ContextVersion.findAsync(query)
    })
    .then(function emitContextVersionUpdate (contextVersions) {
      log.trace({ contextVersions: contextVersions }, 'emitContextVersionUpdate')
      contextVersions.forEach(function (contextVersion) {
        messenger.emitContextVersionUpdate(contextVersion, 'build_running')
      })
    })
    .then(function emitInstanceUpdate () {
      var contextVersionBuildId = job.inspectData.Config.Labels['contextVersion.build._id']
      return InstanceService.emitInstanceUpdateByCvBuildId(contextVersionBuildId, 'build_running')
    })
}
