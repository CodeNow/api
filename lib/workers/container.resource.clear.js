/**
 * update container resource limits
 *
 * @module lib/workers/container.resource.update
 */
'use strict'
require('loadenv')()

const WorkerStopError = require('error-cat/errors/worker-stop-error')
const keypather = require('keypather')()

const Docker = require('models/apis/docker')
const joi = require('utils/joi')

module.exports.jobSchema = joi.object({
  containerId: joi.string().required()
}).unknown().required()
/**
 * update container resource limits
 * @param  {Object} job worker job
 * @return {Promise} worker task promise
 */
module.exports.task = function ContainerResourceClear (job) {
  const docker = new Docker()
  return docker.clearContainerMemoryAsync(job.containerId)
    .catch(function (err) {
      if (keypather.get(err, 'output.statusCode') === 404) {
        throw new WorkerStopError('container does not exist', { err })
      }
    })
}
