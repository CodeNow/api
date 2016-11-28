/**
 * Common utils for workers code
 * @module lib/utils/worker-utils
 */
'use strict'

const keypather = require('keypather')()
const WorkerStopError = require('error-cat/errors/worker-stop-error')

function WorkerUtils () {}

module.exports = WorkerUtils
/**
 * Assert that model was found. If model was not found we would throw `WorkerStopError`
 * Thhis should be used in workers followed by db calls whenever we want to assert that
 * some data was found
 * @param {Object} job  job data used for for logging
 * @param {String} modelName label for the model we check. E.x. `Instance`
 * @param {Object} data optional data
 * @returns {Function} that can be used with `Promise.tap` to check if model exists
 */
WorkerUtils.assertFound = function (job, modelName, extra) {
  return function (model) {
    if (!model) {
      const errorData = {
        report: false,
        job: job,
        extra: extra || {}
      }
      const errorMsg = modelName + ' not found'
      throw new WorkerStopError(errorMsg, errorData, {
        level: 'info'
      })
    }
  }
}

WorkerUtils.isImageBuilderContainer = function (job) {
  return keypather.get(job, 'inspectData.Config.Labels.type') === 'image-builder-container'
}

WorkerUtils.isUserContainer = function (job) {
  return keypather.get(job, 'inspectData.Config.Labels.type') === 'user-container'
}
