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
 * 1. attempt to update db with new state
 * 2. validate update happed (if it did not was not in correct state to move forward)
 * 3. emit updated event on success
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
          'contextVersion.id': joi.string().required()
        }).unknown().required()
      }).unknown().required()
    }).unknown().required()
  }).unknown().required()

  return joi
    .validateOrBoomAsync(job, schema)
    .catch(function (err) {
      throw new TaskFatalError(err)
    })
    .then(function findAndUpdateContextVersion () {
      var contextVersionId = job.inspectData.Config.Labels['contextVersion.id']

      var query = {
        _id: contextVersionId,
        state: 'build starting'
      }
      var update = {
        $set: {
          'build.containerStarted': new Date(),
          'state': 'build started'
        }
      }
      log.info(put({ contextVersionId: contextVersionId }, logData), 'OnImageBuilderContainerCreate: findContextVersion')

      return ContextVersion.findOneAndUpdateAsync(query, update)
    })
    .then(function validateContextVersion (contextVersion) {
      if (!contextVersion) {
        throw new TaskFatalError(
          'container.image-builder.started',
          'ContextVersion was not updated',
          { job: job })
      }

      return contextVersion
    })
    .then(function emitContextVersionUpdate (contextVersion) {
      log.info(logData, 'ContainerImageBuilderStarted: emitContextVersionUpdate')

      messenger.emitContextVersionUpdate(contextVersion, 'build_running')
    })
}
