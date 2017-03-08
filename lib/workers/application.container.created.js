/**
 * Handle application container created event
 * @module lib/workers/application.container.created
 */
'use strict'
require('loadenv')()
const Promise = require('bluebird')
const joi = require('utils/joi')
const keypather = require('keypather')()

const ContextVersion = require('models/mongo/context-version')
const rabbitMQ = require('models/rabbitmq')
const Instance = require('models/mongo/instance')
const InstanceService = require('models/services/instance-service')
const logger = require('logger')
const User = require('models/mongo/user')
const workerUtils = require('utils/worker-utils')
const WorkerStopError = require('error-cat/errors/worker-stop-error')

class Worker {
  constructor (job) {
    this.log = logger.child({
      job: this.job,
      method: 'ApplicationContainerCreatedWorker'
    })
    this.job = job
    this.containerId = this.job.id
    this.instanceId = this.job.inspectData.Config.Labels.instanceId
    this.contextVersionId = this.job.inspectData.Config.Labels.contextVersionId
    this.sessionUserGithubId = this.job.inspectData.Config.Labels.sessionUserGithubId
  }

  /**
   * Handle application.container.created event
   * Flow is following:
   * 1. find context version
   * 2. call `recover` on contextVersion
   * 3. update instance with inspect data
   * 4. publish startInstance container job
   * @param {Object} job - Job info
   * @returns {Promise}
   */

  run () {
    this.log.info('ApplicationContainerCreatedWorker called')
    return ContextVersion.recoverAsync(this.contextVersionId)
  }
}

module.exports = {
  _Worker: Worker,
  task: (job) => {
    const worker = new Worker(job)
    return worker.run()
  },
  jobSchema: joi.object({
    id: joi.string().required(),
    host: joi.string().required(),
    inspectData: joi.object({
      Config: joi.object({
        Labels: joi.object({
          instanceId: joi.string().required(),
          contextVersionId: joi.string().required(),
          sessionUserGithubId: joi.number().required()
        }).unknown().required()
      }).unknown().required()
    }).unknown().required()
  }).unknown().required()
}
