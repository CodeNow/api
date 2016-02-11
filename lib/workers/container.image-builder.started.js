/**
 * Manage starting a build container (and save it to the context version)
 *
 * @module lib/workers/container.image-builder.started
 */
'use strict'
require('loadenv')()

var put = require('101/put')

var ContextVersion = require('models/mongo/context-version')
var joi = require('utils/joi')
var log = require('middlewares/logger')(__filename).log
var messenger = require('socket/messenger')
var TaskFatalError = require('ponos').TaskFatalError

module.exports = ContainerImageBuilderStarted

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
  var logData = {
    tx: true,
    job: job
  }

  var schema = joi.object({
    inspectData: joi.object({
      Config: joi.object({
        Labels: joi.object({
          'contextVersion.build._id': joi.string().required()
        }).unknown().required()
      }).unknown().required()
    }).unknown().required()
  }).unknown().required().label('Job')

  return joi
    .validateOrBoomAsync(job, schema)
    .catch(function (err) {
      throw new TaskFatalError(
        'container.image-builder.started',
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
      log.info(put({ query: query, update: update }, logData), 'ContainerImageBuilderStarted: updateContextVersion')
      // need to update all cv's with this build for dedupe logic to work
      return ContextVersion.updateAsync(query, update, { multi: true })
    })
    .then(function validateUpdate (updatedCount) {
      log.info(put({ updatedCount: updatedCount }, logData), 'ContainerImageBuilderStarted: validateUpdate')

      if (updatedCount === 0) {
        throw new TaskFatalError(
          'container.image-builder.started',
          'ContextVersion was not updated',
          { job: job })
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
      log.info(put(logData, { contextVersions: contextVersions }), 'ContainerImageBuilderStarted: emitContextVersionUpdate')
      contextVersions.forEach(function (contextVersion) {
        messenger.emitContextVersionUpdate(contextVersion, 'build_running')
      })
    })
}
