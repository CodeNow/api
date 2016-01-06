/**
 * start image builder container
 * @module lib/workers/container.image-builder.start
 */
'use strict'
require('loadenv')()

var keypather = require('keypather')()
var log = require('middlewares/logger')(__filename).log
var Promise = require('bluebird')
var put = require('101/put')
var TaskFatalError = require('ponos').TaskFatalError

var ContextVersion = require('models/mongo/context-version')
var Docker = require('models/apis/docker')
var joi = require('utils/joi')

module.exports = containerImageBuilderStart

/**
 * worker task
 * @param  {Object } job worker job
 * @return {Promise} worker task promise
 */
function containerImageBuilderStart (job) {
  var logData = {
    tx: true,
    job: job
  }

  var schema = joi.object({
    dockerHost: joi.string().required(),
    dockerContainerId: joi.string().required(),
    contextVersionId: joi.objectIdString().required()
  })

  return joi.validateOrBoomAsync(job, schema)
    .then(function getContectVersion () {
      log.info(logData, 'containerImageBuilderStart: find cv')

      return Promise.fromCallback(function (cb) {
        ContextVersion.findById(job.contextVersionId, cb)
      }).then(function (contextVersion) {
        if (!contextVersion) {
          throw new TaskFatalError('ContextVersion not found')
        }

        var buildId = keypather.get(contextVersion, 'build._id')
        if (!buildId) {
          throw new TaskFatalError('build._id not found')
        }

        job.buildId = buildId
      })
    })
    .then(function startImageBuilderContainer () {
      log.info(logData, 'containerImageBuilderStart: startImageBuilderContainer')
      var docker = new Docker()

      return docker.startImageBuilderContainerAsync(job.dockerContainerId)
    })
    .then(function updateContextVersion () {
      var update = {
        $set: {
          'build.containerStarted': new Date(),
          'dockerHost': job.dockerHost
        }
      }
      log.info(put({ update: update }, logData), 'containerImageBuilderStart: updateContextVersion')

      return Promise.fromCallback(function (cb) {
        ContextVersion.updateBy('build._id', job.buildId, update, { multi: true }, cb)
      })
    })
    .catch(function onError (err) {
      log.error(put({ err: err }, logData), 'containerImageBuilderStart: onError')

      return Promise.fromCallback(function (cb) {
        ContextVersion.updateBuildErrorByBuildId(job.buildId, err, cb)
      })
    })
}
