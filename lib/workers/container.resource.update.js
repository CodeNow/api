/**
 * update container resource limits
 *
 * @module lib/workers/container.resource.update
 */
'use strict'
require('loadenv')()

var TaskFatalError = require('ponos').TaskFatalError
var keypather = require('keypather')()

var Docker = require('models/apis/docker')
var joi = require('utils/joi')
var logger = require('middlewares/logger')(__filename).log

var docker = new Docker()

module.exports = ContainerResourceUpdate

/**
 * update container resource limits
 * @param  {Object} job worker job
 * @return {Promise} worker task promise
 */
function ContainerResourceUpdate (job) {
  var log = logger.child({
    job: job,
    queue: 'container.image-builder.create',
    tid: job.tid
  })

  var schema = joi.object({
    containerId: joi.string().required(),
    memoryInBytes: joi.number().required()
  }).required().label('Job')

  return joi
    .validateOrBoomAsync(job, schema)
    .catch(function (err) {
      throw new TaskFatalError(
        'container.resource.update',
        'validation failed',
        { job: job, err: err }
      )
    })
    .then(function updateMemoryValue () {
      log.info('updateMemoryValue')
      return docker.updateContainerAsync(job.containerId, job.memoryInBytes)
        .catch(function (err) {
          if (keypather.get(err, 'output.statusCode') === 404) {
            throw new TaskFatalError(
              'container.resource.update',
              'container does not exist',
              { job: job, err: err }
            )
          }
        })
    })
}
