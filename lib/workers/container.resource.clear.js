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

module.exports.jobSchema = joi.object({
  containerId: joi.string().required()
}).unknown().required().label('container.resource.clear job')
/**
 * update container resource limits
 * @param  {Object} job worker job
 * @return {Promise} worker task promise
 */
module.exports.task = function ContainerResourceClear (job) {
  var log = logger.child({
    module: 'ContainerResourceClear'
  })

  log.info('ContainerResourceClear called')
  return docker.clearContainerMemoryAsync(job.containerId)
    .catch(function (err) {
      if (keypather.get(err, 'output.statusCode') === 404) {
        throw new WorkerStopError(
          'container does not exist',
          { job: job, err: err }
        )
      }
    })
}
