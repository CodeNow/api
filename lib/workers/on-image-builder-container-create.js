/**
 * Manage starting a build container (and save it to the context version)
 *
 * @module lib/workers/on-image-builder-container-create
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

module.exports = OnImageBuilderContainerCreate

/**
 * start image builder container in response to the image builder container created event
 * 1. get the context version and validate the job is valid
 * 2.  attempt to start the container
 * 3.1 on success update db and emit updates
 * 3.2 on failure update db with failure
 * @param  {Object} job worker job
 * @return {Promise} worker task promise
 */
function OnImageBuilderContainerCreate (job) {
  var logData = {
    tx: true,
    job: job
  }

  var schema = joi.object({
    host: joi.string().uri({ scheme: 'http' }).required(),
    inspectData: joi.object({
      Config: joi.object({
        Labels: joi.object({
          'contextVersion.id': joi.string().required()
        }).unknown().required()
      }).unknown().required(),
      Id: joi.string().required()
    }).unknown().required()
  }).unknown().required()

  return joi
    .validateOrBoomAsync(job, schema)
    .catch(function (err) {
      throw new TaskFatalError(err)
    })
    .then(function findContextVersion () {
      var contextVersionId = job.inspectData.Config.Labels['contextVersion.id']
      log.info(put({ contextVersionId: contextVersionId }, logData), 'containerImageBuilderStart: findContextVersion')

      return ContextVersion.findByIdAsync(contextVersionId)
    })
    .then(function validateContextVersion (contextVersion) {
      if (!contextVersion) {
        throw new TaskFatalError(
          'on-image-builder-container-create',
          'ContextVersion not found',
          { job: job })
      }

      if (contextVersion.build.containerStarted) {
        throw new TaskFatalError(
          'on-image-builder-container-create',
          'build has already started',
          { job: job })
      }

      if (!contextVersion.build.started) {
        throw new TaskFatalError(
          'on-image-builder-container-create',
          'build has not been marked as started',
          { job: job })
      }

      if (contextVersion.build.finished) {
        throw new TaskFatalError(
          'on-image-builder-container-create',
          'build has already finished',
          { job: job })
      }

      if (!keypather.get(contextVersion, 'build._id')) {
        throw new TaskFatalError(
          'on-image-builder-container-create',
          'build._id not found',
          { job: job })
      }

      return contextVersion
    })
    .then(function startImageBuilderContainer (contextVersion) {
      log.info(logData, 'containerImageBuilderStart: startImageBuilderContainer')
      var docker = new Docker()
      var dockerContainerId = job.inspectData.Id
      var buildId = keypather.get(contextVersion, 'build._id')

      return docker.startImageBuilderContainerAsync(dockerContainerId)
        .then(function updateContextVersion () {
          var update = {
            $set: {
              'build.containerStarted': new Date(),
              'dockerHost': job.host
            }
          }
          log.info(put({ update: update }, logData), 'containerImageBuilderStart: updateContextVersion')

          return ContextVersion.updateByAsync('build._id', buildId, update, { multi: true })
        })
        .then(function emitContextVersionUpdate () {
          log.info(logData, 'containerImageBuilderStart: emitContextVersionUpdate')

          messenger.emitContextVersionUpdate(contextVersion, 'build_running')
        })
        .catch(function onError (err) {
          log.error(put({ err: err }, logData), 'containerImageBuilderStart: onError')
          // save error and also retry incase error was intermittent
          return ContextVersion.updateBuildErrorByBuildIdAsync(buildId, err)
           .finally(function () { throw err })
        })
    })
}
