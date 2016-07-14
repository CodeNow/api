/**
 * Common utils for workers code
 * @module lib/utils/worker-utils
 */
'use strict'

var joi = require('utils/joi')
var TaskFatalError = require('ponos').TaskFatalError

function WorkerUtils () {}

module.exports = WorkerUtils

/**
 * Assert that model was found. If model was not found we would throw `TaskFatalError`
 * Thhis should be used in workers followed by db calls whenever we want to assert that
 * some data was found
 * @param {String} queueName name of the queue in whcih this function was called
 * @param {Object} job  job data used for for logging
 * @param {String} modelName label for the model we check. E.x. `Instance`
 * @returns {Function} that can be used with `Promise.tap` to check if model exists
 */
WorkerUtils.assertFound = function (queueName, job, modelName) {
  return function (model) {
    if (!model) {
      throw new TaskFatalError(
        queueName,
        modelName + ' not found',
        { report: false, job: job }
      )
    }
  }
}

/**
 * Validate job data according to the schema and throw `TaskFatalError` if validation failed
 * @param {String} queueName name of the queue in whcih this function was called
 * @param {Object} job  job data to be validated
 * @param {Object} schema to validate the job
 * @returns {Promise}
 * @rejects {TaskFatalError} if validation failex
 */
WorkerUtils.validateJob = function (queueName, job, schema) {
  return joi.validateOrBoomAsync(job, schema)
    .catch(function (err) {
      throw new TaskFatalError(
        queueName,
        'Invalid Job',
        { validationError: err, job: job }
      )
    })
}
