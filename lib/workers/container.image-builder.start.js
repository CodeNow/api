/**
 * Pull an image for an instance in the worker. Should be robust (retriable on failure)
 * @module lib/workers/pull-instance-image
 */

var path = require('path')

require('loadenv')()
var Boom = require('dat-middleware').Boom
var error = require('error')
var put = require('101/put')
var logger = require('middlewares/logger')(__filename)
var Promise = require('bluebird')
var TaskFatalError = require('ponos').TaskFatalError

var Docker = require('models/apis/docker')
var Instance = require('models/mongo/instance')
var joi = require('utils/joi')
var rabbitMQ = require('models/rabbitmq')
var toJSON = require('utils/to-json')
var toObjectId = require('utils/to-object-id')

// queue name matches filename
var queue = path.basename(__filename, '.js')
var log = logger.log

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
        var buildId = keypather.get(job, 'contextVersion.build._id')
        if (!buildId) {
          throw new TaskFatalError('build._id not found')
        }
        job.contextVersion = contextVersion
      })
    })
    .then(function startImageBuilderContainer () {
      log.info(logData, 'containerImageBuilderStart: startImageBuilderContainer')
      var docker = new Docker()

      return docker.startImageBuilderContainerAsync(job.dockerContainerId)
    })
    .then(function updateContextVersion () {
      log.info(logData, 'containerImageBuilderStart: updateContextVersion')
      var update = {
        $set: {
          'build.containerStarted': new Date(),
          'dockerHost': job.dockerHost
        }
      }

      return Promise.fromCallback(function (cb) {
        ContextVersion.updateBy('build._id', job.contextVersion.build._id, update, { multi: true }, cb)
      })
    })
    .catch(function onError (err) {
      log.error(self.logData, 'containerImageBuilderStart: onError')

      return Promise.fromCallback(function (cb) {
        ContextVersion.updateBuildErrorByBuildId(job.contextVersion.build._id, err, cb)
      })
    })
}
