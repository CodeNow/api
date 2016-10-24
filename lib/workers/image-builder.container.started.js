/**
 * Manage starting a build container (and save it to the context version)
 *
 * @module lib/workers/image-builder.container.started
 */
'use strict'
require('loadenv')()

const Promise = require('bluebird')
const ContextVersion = require('models/mongo/context-version')
const joi = require('utils/joi')
const InstanceService = require('models/services/instance-service')
const logger = require('logger')
const messenger = require('socket/messenger')
const WorkerStopError = require('error-cat/errors/worker-stop-error')

module.exports.jobShema = joi.object({
  inspectData: joi.object({
    Config: joi.object({
      Labels: joi.object({
        'contextVersion.build._id': joi.string().required()
      }).unknown().required()
    }).unknown().required()
  }).unknown().required()
}).unknown().required()

/**
 * update database with new started state information
 * 1. validate job
 * 2. find cv with desired state and update
 * 3. validate cv was updated (if not, cv was in incorrect state to move forward)
 * 4. on success, emit updated event for all cv's with this build
 * @param  {Object} job worker job
 * @return {Promise} worker task promise
 */
module.exports.task = (job) => {
  const log = logger.child({ method: 'ContainerImageBuilderStarted' })
  return Promise
    .try(function updateContextVersion () {
      const contextVersionBuildId = job.inspectData.Config.Labels['contextVersion.build._id']
      const query = {
        'build._id': contextVersionBuildId,
        state: ContextVersion.states.buildStarting
      }
      const update = {
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
      const contextVersionBuildId = job.inspectData.Config.Labels['contextVersion.build._id']
      const query = {
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
      const contextVersionBuildId = job.inspectData.Config.Labels['contextVersion.build._id']
      return InstanceService.emitInstanceUpdateByCvBuildId(contextVersionBuildId, 'build_running')
    })
}
