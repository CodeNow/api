/**
 * Manage starting a build container (and save it to the context version)
 * on a dock with retry attempts
 *
 * @module lib/workers/on-image-builder-container-create
 */
'use strict'
require('loadenv')()

var keypather = require('keypather')()
var put = require('101/put')
var Promise = require('bluebird')

var ContextVersion = require('models/mongo/context-version')
var Docker = require('models/apis/docker')
var joi = require('utils/joi')
var log = require('middlewares/logger')(__filename).log
var TaskFatalError = require('ponos').TaskFatalError

module.exports = OnImageBuilderContainerCreate

/**
 * worker task
 * @param  {Object } job worker job
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
    .then(function findContextVersion () {
      var contextVersionId = job.inspectData.Config.Labels['contextVersion.id']
      log.info(put({ contextVersionId: contextVersionId }, logData), 'containerImageBuilderStart: findContextVersion')
      return Promise.fromCallback(function (cb) {
        ContextVersion.findById(contextVersionId, cb)
      })
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

      var buildId = keypather.get(contextVersion, 'build._id')
      if (!buildId) {
        throw new TaskFatalError('build._id not found')
      }

      job.buildId = buildId
    })
    .then(function startImageBuilderContainer () {
      log.info(logData, 'containerImageBuilderStart: startImageBuilderContainer')
      var docker = new Docker()
      var dockerContainerId = job.inspectData.Id

      return docker.startImageBuilderContainerAsync(dockerContainerId)
    })
    .then(function updateContextVersion () {
      var update = {
        $set: {
          'build.containerStarted': new Date(),
          'dockerHost': job.host
        }
      }
      log.info(put({ update: update }, logData), 'containerImageBuilderStart: updateContextVersion')

      return Promise.fromCallback(function (cb) {
        ContextVersion.updateBy('build._id', job.buildId, update, { multi: true }, cb)
      })
    })
    .catch(function onError (err) {
      log.error(put({ err: err }, logData), 'containerImageBuilderStart: onError')
      if (!job.buildId) { throw err }

      return Promise.fromCallback(function (cb) {
        ContextVersion.updateBuildErrorByBuildId(job.buildId, err, cb)
      })
    })
}
