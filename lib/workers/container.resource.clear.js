/**
 * update container resource limits
 *
 * @module lib/workers/container.resource.update
 */
'use strict'
require('loadenv')()

var WorkerStopError = require('error-cat/errors/worker-stop-error')
var keypather = require('keypather')()

var Docker = require('models/apis/docker')
var joi = require('utils/joi')
var logger = require('middlewares/logger')(__filename).log

var docker = new Docker()

module.exports = ContainerResourceClear

var schema = joi.object({
  containerId: joi.string().required(),
  tid: joi.string()
}).required().label('container.resource.update job')
/**
 * update container resource limits
 * @param  {Object} job worker job
 * @return {Promise} worker task promise
 */
function ContainerResourceClear (job) {
  var log = logger.child({
    job: job,
    queue: 'container.image-builder.create',
    tid: job.tid
  })

  return joi
    .validateOrBoomAsync(job, schema)
    .catch(function (err) {
      throw new WorkerStopError(
        'validation failed',
        { job: job, err: err }
      )
    })
    .then(function updateMemoryValue () {
      log.info('updateMemoryValue')
      return docker.clearContainerMemoryAsync(job.containerId)
        .catch(function (err) {
          if (keypather.get(err, 'output.statusCode') === 404) {
            throw new WorkerStopError(
              'container does not exist',
              { job: job, err: err }
            )
          }
        })
    })
}
