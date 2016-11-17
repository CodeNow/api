/**
 * Delete application container in the worker
 * @module lib/workers/container.delete
 */
'use strict'

const WorkerStopError = require('error-cat/errors/worker-stop-error')
const joi = require('utils/joi')
const keypather = require('keypather')()

const Docker = require('models/apis/docker')

module.exports.jobSchema = joi.object({
  containerId: joi.string().required()
}).unknown().required()

/**
 * Handle container.delete command
 * Flow is following:
 * 1. stop the container
 * 2. remove the container
 * @param {Object} job - Job info
 * @returns {Promise}
 */
module.exports.task = (job) => {
  const docker = new Docker()
  return docker.removeContainerAsync(job.containerId)
    .catch(function (err) {
      const statusCode = keypather.get(err, 'output.statusCode')
      if (statusCode === 404) {
        throw new WorkerStopError('container not found', {})
      }
      throw err
    })
}
