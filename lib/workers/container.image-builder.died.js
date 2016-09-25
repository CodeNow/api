/**
 * This worker should
 *  * fetch the contextVersion associated with this build
 *  * fetch build logs & update contextVersion
 *  * emit instance updates
 *  * dealloc image builder network
 *
 * @module lib/workers/container.image-builder.died
 */
'use strict'
require('loadenv')()
const Boom = require('dat-middleware').Boom
const isEmpty = require('101/is-empty')
const joi = require('utils/joi')
const keypather = require('keypather')()
const Promise = require('bluebird')

const error = require('error')
const InstanceService = require('models/services/instance-service')
const BuildService = require('models/services/build-service')
const Isolation = require('models/mongo/isolation')
const logger = require('logger')
const rabbitMQ = require('models/rabbitmq')

class Worker {
  constructor (job) {
    this.from = job.from
    this.host = job.host
    this.id = job.id
    this.time = job.time
    this.inspectData = job.inspectData
    this.contextVersionBuildId = job.inspectData.Config.Labels['contextVersion.build._id']
    this.ownerUsername = job.inspectData.Config.Labels.ownerUsername
    this.sessionUserGithubId = job.inspectData.Config.Labels.sessionUserGithubId
    this.dockerImageTag = job.inspectData.Config.Labels.dockerTag

    this.log = logger.child({
      job: job,
      module: 'ContainerImageBuilderDied'
    })
  }

  /**
   * @resolves {Undefined}
   * @returns {Promise}
   */
  task () {
    return this._clearBuildResources()
      .bind(this)
      .then(this._updateModelsAndGetUpdatedContextVersions)
      .then(this._emitUpdateAndGetInstances)
      .spread(this._updateAndGetAutoDeployedInstances)
      .then(this._filterOutAndKillIsolatedInstances)
      .then(this._createContainersIfSuccessful)
  }

  /**
   * @return {Promise}
   */
  _clearBuildResources () {
    return Promise.try(() => {
      rabbitMQ.clearContainerMemory({ containerId: this.id })
    })
  }

  /**
   * @return {Promise}
   * @resolves {ContextVersion[]}
   */
  _updateModelsAndGetUpdatedContextVersions () {
    if (this._isSuccessfulBuild()) {
      rabbitMQ.pushImage({
        dockerHostUrl: this.host,
        imageTag: this.dockerImageTag
      })

      return BuildService.updateSuccessfulBuild(this.contextVersionBuildId)
    } else {
      const errorMessage = this._isTimedOutBuild() ? 'timed out' : undefined
      this._reportBuildFailure()

      return BuildService.updateFailedBuild(this.contextVersionBuildId, errorMessage)
    }
  }

  /**
   * @return {Boolean}
   */
  _isSuccessfulBuild () {
    return this.inspectData.State.ExitCode === 0
  }

  /**
   * image builder sets exit code to 124 if it timed out
   * @return {Boolean}
   */
  _isTimedOutBuild () {
    return this.inspectData.State.ExitCode === 124
  }

  /**
   * reports to rollbar & slack build-failures room
   */
  _reportBuildFailure () {
    const log = logger.child({ method: '_reportBuildFailure' })
    log.info('_reportBuildFailure called')
    const errorMessage = 'Building dockerfile failed'
    // reports to rollbar & slack build-failures room
    const err = Boom.badRequest(errorMessage, {
      data: this.inspectData
    })
    keypather.set(err, 'data.level', 'warning')
    error.log(err)
  }

  /**
   * @return {Promise}
   * @resolves {[Instance[], ContextVersion[]]}
   */
  _emitUpdateAndGetInstances (contextVersions) {
    return InstanceService.emitInstanceUpdateByCvBuildId(this.contextVersionBuildId, 'patch')
      .then((instances) => { return [ instances, contextVersions ] })
  }

  /**
   * @param  {Instance[]} instances
   * @param  {ContextVersion[]} contextVersions
   * @return {Promise}
   * @resolves {Instance[]}
   */
  _updateAndGetAutoDeployedInstances (instances, contextVersions) {
    return this._handleAutoDeploy(contextVersions)
      .then((manualInstances) => {
        if (!instances || isEmpty(instances)) {
          this.log.trace('hook update, using manual list')
          return manualInstances
        } else {
          this.log.trace('manual update, using normal list')
          return instances
        }
      })
  }

  /**
   * I think we would be able to generalize this code later and come up with some event
   * This function handle autdeploy case. Build was finished and we want to put build on the corresponding instances
   * and send event that instance was deployed
   * @param {Array} - array of cvs that were updated
   * @return {Promise}
   * @resolves {[Instances]} - Array of instances that were updated
   */
  _handleAutoDeploy (versions) {
    const log = logger.child({
      method: 'handleAutoDeploy',
      cvs: versions
    })
    log.info('_handleAutoDeploy called')
    // this code is necessary for the autodeploy flow
    // in case `triggeredAction.manual === false` then we need to find instances and patch them
    // with the new completed build
    // call updateInstance if triggeredAction wasn't manual
    return Promise.try(() => {
      if (!versions || !versions[0]) {
        return []
      }
      const cv = versions[0]
      log.trace({ cv: cv }, 'process cv')
      const triggeredActionName = keypather.get(cv, 'build.message')
      const triggeredAction = keypather.get(cv, 'build.triggeredAction') || {}
      const triggeredACV = triggeredAction.appCodeVersion || {}
      const isManualAction = triggeredAction.manual

      if (!isManualAction && triggeredActionName === 'autodeploy') {
        return InstanceService.updateBuildByRepoAndBranch(cv, triggeredACV.repo, triggeredACV.branch)
          .tap((instances) => {
            log.trace({ instances: instances }, 'updated instances with a build')
            if (instances) {
              instances.forEach((instance) => {
                rabbitMQ.instanceDeployed({
                  instanceId: keypather.get(instance, '_id.toString()'),
                  cvId: keypather.get(instance, 'contextVersion._id.toString()')
                })
              })
            }
          })
      }
      return []
    })
  }

  /**
   * create instance container jobs if the build was successful
   * @param  {Instance[]]} instances array of instance docs
   */
  _createContainersIfSuccessful (instances) {
    const log = logger.child({
      method: '_createContainersIfSuccessful',
      sessionUserGithubId: this.sessionUserGithubId,
      buildSuccessful: this._isSuccessfulBuild()
    })
    log.info('_createContainersIfSuccessful called')
    const ownerUsername = this.ownerUsername
    if (this._isSuccessfulBuild()) {
      instances.forEach((instance) => {
        const jobData = {
          contextVersionId: instance.contextVersion._id.toString(),
          instanceId: instance._id.toString(),
          ownerUsername: ownerUsername,
          sessionUserGithubId: this.sessionUserGithubId
        }
        const manual = keypather.get(instance, 'contextVersion.build.triggeredAction.manual')
        // happens when instance was forked and builds was already built successfully
        if (!manual) {
          rabbitMQ.instanceDeployed({
            instanceId: keypather.get(instance, '_id.toString()'),
            cvId: keypather.get(instance, 'contextVersion._id.toString()')
          })
        }
        rabbitMQ.createInstanceContainer(jobData)
      })
    }
  }

  /**
   * Will loop through instances, fetching their isolations and if they are the isolation
   * group master they will kill the isolation
   * @param {[Instance]} instances array of instance docs
   * @returns {Promise}
   * @resolves {[Instances]} - Returns an array of instances which were not part of a kill trigger
   * @private
   */
  _filterOutAndKillIsolatedInstances (instances) {
    const log = logger.child({ method: '_filterOutAndKillIsolatedInstances' })
    log.trace('_filterOutAndKillIsolatedInstances called')

    return Promise.filter(instances, (instance) => {
      if (instance.isolated && instance.isIsolationGroupMaster) {
        log.trace('Searching for isolation')

        return Isolation.findOneAsync({ _id: instance.isolated, redeployOnKilled: true })
          .then((isolation) => {
            log.trace({isolation: isolation}, 'isolation search results')
            if (isolation) {
              rabbitMQ.killIsolation({ isolationId: instance.isolated, triggerRedeploy: true })
              return false
            }
            return true
          })
      }
      return true
    })
  }
}

module.exports = {
  _Worker: Worker,
  task: (job) => {
    const worker = new Worker(job)
    return worker.task()
  },
  jobSchema: joi.object({
    from: joi.string().required(),
    host: joi.string().uri({ scheme: 'http' }).required(),
    id: joi.string().required(),
    time: joi.number().required(),
    inspectData: joi.object({
      Config: joi.object({
        Labels: joi.object({
          'contextVersion.build._id': joi.string().required(),
          'ownerUsername': joi.string().required(),
          'sessionUserGithubId': joi.number().required()
        }).unknown().required()
      }).unknown().required()
    }).unknown().required()
  }).unknown().required().label('container.image-builder.died job')
}
