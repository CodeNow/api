'use strict'

var TaskFatalError = require('ponos').TaskFatalError

function WorkerUtils () {}

module.exports = WorkerUtils


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
