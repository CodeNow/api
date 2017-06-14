'use strict'
require('loadenv')()
const pick = require('101/pick')
const WorkerStopError = require('error-cat/errors/worker-stop-error')

const Deployment = require('../models/mongo/deployment')
const Instance = require('../models/mongo/instance')
const joi = require('../utils/joi')
const logger = require('../logger')
const publisher = require('../models/rabbitmq/index.js')
const schemas = require('../models/rabbitmq/schemas')

class Worker {
  constructor (job) {
    this.job = job.job

    this.log = logger.child({
      job,
      module: 'deploymentBuildComplete'
    })
  }

  /**
   * @resolves {Undefined}
   * @returns {Promise}
   */
  task () {
    return Deployment.setStateToDeploying(this.job.deploymentId).bind(this)
      .catch(Deployment.IncorrectState, this._stopWorker)
      .then(this._emitDeploymentBuiltEvent)
  }

  _emitDeploymentBuiltEvent (deployment) {
    this.log('_emitDeploymentBuiltEvent called')

    return this._findDeploymentInstances(deployment)
      .then((instances) => {
        return publisher.publishDeploymentBuilt({
          deployment,
          instances
        })
      })
  }

  _findDeploymentInstances (deployment) {
    return Promise.map(deployment.services, (service) => {
      return Instance.findByIdAsync(service.instanceId)
    })
  }

  _stopWorker (err) {
    throw new WorkerStopError(err.message, err)
  }
}

module.exports = {
  _Worker: Worker,

  task: (job) => {
    const worker = new Worker(job)
    return worker.task()
  },

  jobSchema: joi.object({
    deploymentId: joi.string().required()
  })
}
