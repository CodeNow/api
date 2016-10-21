'use strict'
require('loadenv')()

const keypather = require('keypather')()
const Instance = require('models/mongo/instance')
const InstanceService = require('models/services/instance-service')
const workerUtils = require('utils/worker-utils')
const schemas = require('models/rabbitmq/schemas')

module.exports.jobSchema = schemas.instanceStarted

/**
 * @param {Object} job - Job object
 * @returns {Promise}
 * @resolve {undefined} this promise will not return anything
 */
module.exports.task = (job) => {
  return Instance.findByIdAsync(job.instance._id)
    .tap(workerUtils.assertFound(job, 'Instance'))
    .then(function (instance) {
      const sessionUserGithubId = keypather.get(job, 'instance.container.inspect.Config.Labels.sessionUserGithubId')
      return InstanceService.emitInstanceUpdate(instance, sessionUserGithubId, 'start')
    })
    .return(undefined)
}
