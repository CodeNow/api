/**
 * Handle instance container created event
 * @module lib/workers/instance.container.created
 */
'use strict'
require('loadenv')()
const joi = require('utils/joi')
const keypather = require('keypather')()
const WorkerStopError = require('error-cat/errors/worker-stop-error')

const ContextVersion = require('models/mongo/context-version')
const Docker = require('models/apis/docker')
const Instance = require('models/mongo/instance')
const InstanceService = require('models/services/instance-service')
const logger = require('logger')
const User = require('models/mongo/user')
const workerUtils = require('utils/worker-utils')

class Worker {
  constructor (job) {
    this.log = logger.child({
      job: this.job,
      method: 'InstanceContainerCreatedWorker'
    })
    this.job = job
    this.containerId = this.job.id
    this.instanceId = this.job.inspectData.Config.Labels.instanceId
    this.contextVersionId = this.job.inspectData.Config.Labels.contextVersionId
    this.sessionUserGithubId = this.job.inspectData.Config.Labels.sessionUserGithubId
  }

  /**
   * Handle instance.container.created event
   * Flow is following:
   * 1. find context version
   * 2. call `recover` on contextVersion
   * 3. update instance with inspect data
   * 4. publish startInstance container job
   * @param {Object} job - Job info
   * @returns {Promise}
   */

  run () {
    this.log.info('InstanceContainerCreatedWorker called')
    return ContextVersion.recoverAsync(this.contextVersionId)
      .bind(this)
      .then(this._findAndSetCreatingInstance)
      .then(this._startInstance)
  }

  /**
   * @return {Promise}
   * @resolves {Instance}
   * @rejects {WorkerStopError} when instance not found or in bad state
   */
  _findAndSetCreatingInstance () {
    this.log.trace('update query')
    const updateData = {
      dockerContainer: this.containerId,
      dockerHost: this.job.host,
      inspect: this.job.inspectData,
      ports: keypather.get(this.job, 'inspectData.NetworkSettings.Ports')
    }

    this.log.trace({ updateData: updateData }, 'update query')
    return Instance.markAsCreating(
      this.instanceId,
      this.contextVersionId,
      this.containerId,
      updateData
    )
    .bind(this)
    .catch(Instance.NotFoundError, this._removeContainerAndStopWorker)
  }

  /**
   * @param  {Error} err
   * @throws {WorkerStopError}
   */
  _removeContainerAndStopWorker (err) {
    this.log.trace({ err: err }, '_removeContainerAndStopWorker called')
    const docker = new Docker()
    return docker.removeContainerAsync(this.containerId)
      .then(() => {
        throw new WorkerStopError(err.message, {
          err: err
        }, {
          level: 'warning'
        })
      })
  }

  /**
   * @param  {Instance} instance to start
   * @return {Promise}
   */
  _startInstance (instance) {
    this.log.trace('publish start job')

    return User.findByGithubIdAsync(this.sessionUserGithubId)
      .tap(workerUtils.assertFound(this.job, 'User', { githubId: this.sessionUserGithubId }))
      .then(InstanceService.startInstance.bind(this, instance.shortHash))
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
