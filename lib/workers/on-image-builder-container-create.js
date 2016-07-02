/**
 * Manage starting a build container (and save it to the context version)
 *
 * @module lib/workers/on-image-builder-container-create
 */
'use strict'
require('loadenv')()

var put = require('101/put')
var pluck = require('101/pluck')

var ContextVersion = require('models/mongo/context-version')
var Docker = require('models/apis/docker')
var InstanceService = require('models/services/instance-service')
var joi = require('utils/joi')
var keypather = require('keypather')()
var log = require('middlewares/logger')(__filename).log
var messenger = require('socket/messenger')
var moment = require('moment')
var TaskError = require('ponos').TaskError
var TaskFatalError = require('ponos').TaskFatalError

module.exports = OnImageBuilderContainerCreate

var schema = joi.object({
  host: joi.string().uri({ scheme: 'http' }).required(),
  inspectData: joi.object({
    Config: joi.object({
      Labels: joi.object({
        'contextVersion.build._id': joi.string().required()
      }).unknown().required()
    }).unknown().required(),
    Id: joi.string().required()
  }).unknown().required()
}).unknown().required().label('Job')

/**
 * start image builder container in response to the image builder container created event
 * 1. validate job
 * 2. find cv with desired state and update
 * 3. validate cv was updated (if not, cv was in incorrect state to move forward)
 * 4. attempt to start image builder container
 * @param  {Object} job worker job
 * @return {Promise} worker task promise
 */
function OnImageBuilderContainerCreate (job) {
  var contextVersionBuildId = keypather.get(job, 'inspectData.Config.Labels["contextVersion.build._id"]')
  var logData = {
    tx: true,
    contextVersionBuildId: contextVersionBuildId,
    host: keypather.get(job, 'host')
  }

  return joi
    .validateOrBoomAsync(job, schema)
    .catch(function (err) {
      throw new TaskFatalError(
        'on-image-builder-container-create',
        'validation failed',
        { job: job, err: err }
      )
    })
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
          dockerHost: job.host
        }
      }
      log.info(put({ query: query, update: update }, logData), 'OnImageBuilderContainerCreate: updateContextVersion')
      // need to update all cv's with this build for dedupe logic to work
      return ContextVersion.updateAsync(query, update, { multi: true })
    })
    .then(function validateUpdate (updatedCount) {
      log.info(put({ updatedCount: updatedCount }, logData), 'OnImageBuilderContainerCreate: validateUpdate')

      if (updatedCount === 0) {
        throw new TaskFatalError(
          'on-image-builder-container-create',
          'no valid ContextVersion found to start',
          { job: job })
      }
    })
    .then(function startImageBuilderContainer () {
      log.info(logData, 'OnImageBuilderContainerCreate: startImageBuilderContainer')

      var docker = new Docker()
      var dockerContainerId = job.inspectData.Id

      return docker.startContainerAsync(dockerContainerId)
        .catch(function (err) {
          if (keypather.get(err, 'output.statusCode') === 404) {
            var created = keypather.get(job, 'inspectData.Created')
            if (created && moment(created) < moment().subtract(5, 'minutes')) {
              throw new TaskFatalError(
                'on-image-builder-container-create',
                'container does not exist after 5 minutes',
                { job: job })
            }
            throw new TaskError(
              'on-image-builder-container-create',
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
      log.info(put(logData, {
        contextVersions: contextVersions.map(pluck('_id'))
      }), 'OnImageBuilderContainerCreate: emitContextVersionUpdate')

      contextVersions.forEach(function (contextVersion) {
        messenger.emitContextVersionUpdate(contextVersion, 'build_started')
      })
    })
    .then(function emitInstanceUpdate () {
      return InstanceService.emitInstanceUpdateByCvBuildId(contextVersionBuildId, 'build_started', false)
    })
}
