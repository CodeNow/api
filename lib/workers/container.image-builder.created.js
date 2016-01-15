/**
 * Manage starting a build container (and save it to the context version)
 *
 * @module lib/workers/container.image-builder.created
 */
'use strict'
require('loadenv')()

var keypather = require('keypather')()
var put = require('101/put')

var ContextVersion = require('models/mongo/context-version')
var Docker = require('models/apis/docker')
var joi = require('utils/joi')
var log = require('middlewares/logger')(__filename).log
var messenger = require('socket/messenger')
var TaskFatalError = require('ponos').TaskFatalError

module.exports = ContainerImageBuilderCreated

/**
 * start image builder container in response to the image builder container created event
 * 1. get the context version and validate the job is valid
 * 2.  attempt to start the container
 * 3.1 on success update db and emit updates
 * 3.2 on failure update db with failure
 * @param  {Object} job worker job
 * @return {Promise} worker task promise
 */
function ContainerImageBuilderCreated (job) {
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
      }).unknown().required(),
    }).unknown().required()
  }).unknown().required()

  return joi
    .validateOrBoomAsync(job, schema)
    .catch(function (err) {
      throw new TaskFatalError(err)
    })
    .then(function findAndUpdateContextVersion () {
      var query = {
        _id: job.inspectData.Config.Labels['contextVersion.id']
        state: 'build starting'
      }
      var update = {
        $set: {
          'state': 'build started'
          'build.containerStarted': new Date()
        }
      }
      log.info(put({ contextVersionId: contextVersionId }, logData), 'OnImageBuilderContainerCreate: findContextVersion')

      return ContextVersion.findOneAndUpdateAsync(query, update)
    })
    .then(function validateContextVersion (contextVersion) {
      if (!contextVersion) {
        throw new TaskFatalError(
          'container.image-builder.created',
          'ContextVersion was not updated',
          { job: job })
      }
    })
    .then(function emitContextVersionUpdate () {
      log.info(logData, 'ContainerImageBuilderCreated: emitContextVersionUpdate')

      messenger.emitContextVersionUpdate(contextVersion, 'build_running')
    })
}
