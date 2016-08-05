/**
 * Common utils for workers code
 * @module lib/utils/worker-utils
 */
'use strict'

const joi = require('utils/joi')
const WorkerStopError = require('error-cat/errors/worker-stop-error')

module.exports = class WorkerUtils {
  /**
   * Assert that model was found. If model was not found we would throw `WorkerStopError`
   * Thhis should be used in workers followed by db calls whenever we want to assert that
   * some data was found
   * @param {String} queueName name of the queue in whcih this function was called
   * @param {Object} job  job data used for for logging
   * @param {String} modelName label for the model we check. E.x. `Instance`
   * @param {Object} query optional query data
   * @returns {Function} that can be used with `Promise.tap` to check if model exists
   */
  static assertFound (job, modelName, query) {
    return (model) => {
      if (!model) {
        const errorData = {
          report: false,
          job: job,
          query: query || {}
        }
        const errorMsg = modelName + ' not found'
        throw new WorkerStopError(errorMsg, errorData)
      }
    }
  }

  /**
   * Validate job data according to the schema and throw `WorkerStopError` if validation failed
   * @param {String} queueName name of the queue in whcih this function was called
   * @param {Object} job  job data to be validated
   * @param {Object} schema to validate the job
   * @returns {Promise}
   * @resolves {undefined} if successful
   * @rejects {WorkerStopError} if validation failed
   */
  static validateJob (job, schema) {
    return joi.validateOrBoomAsync(job, schema).return(undefined)
      .catch(function (err) {
        throw new WorkerStopError(
          'Invalid Job',
          { validationError: err, job: job }
        )
      })
  }
}
