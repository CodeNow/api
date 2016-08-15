/**
 * Manage starting a build container (and save it to the context version)
 *
 * @module lib/workers/container.image-builder.created
 */
'use strict'
require('loadenv')()
var pluck = require('101/pluck')

var ContextVersion = require('models/mongo/context-version')
var Docker = require('models/apis/docker')
var InstanceService = require('models/services/instance-service')
var joi = require('utils/joi')
var keypather = require('keypather')()
var logger = require('logger')
var messenger = require('socket/messenger')
var moment = require('moment')
var WorkerError = require('error-cat/errors/worker-error')
var WorkerStopError = require('error-cat/errors/worker-stop-error')
var workerUtils = require('utils/worker-utils')

module.exports = ContainerImageBuilderCreated

var schema = joi.object({
  host: joi.string().uri({ scheme: 'http' }).required(),
  inspectData: joi.object({
    Config: joi.object({
      Labels: joi.object({
        'contextVersion.build._id': joi.string().required(),
        dockerTag: joi.string().required()
      }).unknown().required()
    }).unknown().required(),
    Id: joi.string().required()
  }).unknown().required(),
  tid: joi.string()
}).unknown().required().label('on-image-builder-container-create job')

/**
 * start image builder container in response to the image builder container created event
 * 1. validate job
 * 2. find cv with desired state and update
 * 3. validate cv was updated (if not, cv was in incorrect state to move forward)
 * 4. attempt to start image builder container
 * @param  {Object} job worker job
 * @return {Promise} worker task promise
 */
function ContainerImageBuilderCreated (job) {
  var contextVersionBuildId = keypather.get(job, 'inspectData.Config.Labels["contextVersion.build._id"]')
  var log = logger.child({ method: 'ContainerImageBuilderCreated' })
  log.info('ContainerImageBuilderCreated called')

  return workerUtils.validateJob(job, schema)
    .then(function updateContextVersion () {
      var query = {
        'build._id': contextVersionBuildId,
        'build.finished': {
          $exists: false
        },
        'build.started': {
          $exists: true
        },
        state: { $ne: ContextVersion.states.buildStarted }
      }
      var update = {
        $set: {
          state: ContextVersion.states.buildStarting,
          dockerHost: job.host,
          'build.dockerContainer': job.Id,
          'build.dockerTag': job.inspectData.Config.Labels.dockerTag
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
          'no valid ContextVersion found to start',
          { job: job })
      }
    })
    .then(function startImageBuilderContainer () {
      log.trace('startImageBuilderContainer')

      var docker = new Docker()
      var dockerContainerId = job.inspectData.Id

      return docker.startContainerAsync(dockerContainerId)
        .catch(function (err) {
          if (keypather.get(err, 'output.statusCode') === 404) {
            var created = keypather.get(job, 'inspectData.Created')
            if (created && moment(created) < moment().subtract(5, 'minutes')) {
              throw new WorkerStopError(
                'container does not exist after 5 minutes',
                { job: job })
            }
            throw new WorkerError(
              'container does not exist',
              { job: job, err: err }
            )
          }
          throw err
        })
    })
    .then(function findContextVersions () {
      var query = {
        'build._id': contextVersionBuildId,
        'state': ContextVersion.states.buildStarting
      }
      return ContextVersion.findAsync(query)
    })
    .then(function emitContextVersionUpdate (contextVersions) {
      log.trace({ contextVersions: contextVersions.map(pluck('_id')) }, 'emitContextVersionUpdate')

      contextVersions.forEach(function (contextVersion) {
        messenger.emitContextVersionUpdate(contextVersion, 'build_started')
      })
    })
    .then(function emitInstanceUpdate () {
      return InstanceService.emitInstanceUpdateByCvBuildId(contextVersionBuildId, 'build_started', false)
    })
}
