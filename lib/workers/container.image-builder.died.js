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
var Boom = require('dat-middleware').Boom
var isEmpty = require('101/is-empty')
var joi = require('utils/joi')
var keypather = require('keypather')()
var Promise = require('bluebird')

var error = require('error')
var InstanceService = require('models/services/instance-service')
var BuildService = require('models/services/build-service')
var Isolation = require('models/mongo/isolation')
var logger = require('logger')
var rabbitMQ = require('models/rabbitmq')

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
      .spread((instances, versions) => {
        return this._handleAutoDeploy(versions)
          .then((manualInstances) => {
            if (!instances || isEmpty(instances)) {
              this.log.trace('hook update, using manual list')
              return manualInstances
            } else {
              this.log.trace('manual update, using normal list')
              return instances
            }
          })
          .then((isolationInstances) => {
            return this._killIsolationIfNeeded(isolationInstances)
          })
          .then((nonKilledInstances) => {
            return this._createContainersIfSuccessful(nonKilledInstances)
          })
      })
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
   * @return {Promise}
   * @resolves {[Instance[], ContextVersion[]]}
   */
  _emitUpdateAndGetInstances (contextVersions) {
    return InstanceService.emitInstanceUpdateByCvBuildId(this.contextVersionBuildId, 'patch')
      .then((instances) => { return [ instances, contextVersions ] })
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
   * I think we would be able to generalize this code later and come up with some event
   * This function handle autdeploy case. Build was finished and we want to put build on the corresponding instances
   * and send event that instance was deployed
   * @param {Array} - array of cvs that were updated
   * @return {Promise}
   * @resolves {[Instances]} - Array of instances that were updated
   */
  _handleAutoDeploy (versions) {
    var log = logger.child({
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
      var cv = versions[0]
      log.trace({ cv: cv }, 'process cv')
      var triggeredActionName = keypather.get(cv, 'build.message')
      var triggeredAction = keypather.get(cv, 'build.triggeredAction') || {}
      var triggeredACV = triggeredAction.appCodeVersion || {}
      var isManualAction = triggeredAction.manual

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
   * reports to rollbar & slack build-failures room
   */
  _reportBuildFailure () {
    var log = logger.child({ method: 'ContainerImageBuilderDied._reportBuildFailure' })
    log.info('ContainerImageBuilderDied._reportBuildFailure called')
    var errorMessage = 'Building dockerfile failed'
    // reports to rollbar & slack build-failures room
    var err = Boom.badRequest(errorMessage, {
      data: this.inspectData
    })
    keypather.set(err, 'data.level', 'warning')
    error.log(err)
    log.trace({ errorMessage: errorMessage }, 'sending error message to rollbar')
  }

  /**
   * create instance container jobs if the build was successful
   * @param  {Instance[]]} instances array of instance docs
   */
  _createContainersIfSuccessful (instances) {
    var log = logger.child({
      method: 'ContainerImageBuilderDied._createContainersIfSuccessful',
      sessionUserGithubId: this.sessionUserGithubId,
      buildSuccessful: this._isSuccessfulBuild()
    })
    log.info('ContainerImageBuilderDied._createContainersIfSuccessful called')
    var ownerUsername = this.ownerUsername
    if (this._isSuccessfulBuild()) {
      instances.forEach((instance) => {
        var jobData = {
          contextVersionId: instance.contextVersion._id.toString(),
          instanceId: instance._id.toString(),
          ownerUsername: ownerUsername,
          sessionUserGithubId: this.sessionUserGithubId
        }
        var manual = keypather.get(instance, 'contextVersion.build.triggeredAction.manual')
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
  _killIsolationIfNeeded (instances) {
    var log = logger.child({ method: '_killIsolationIfNeeded' })
    log.trace('_killIsolationIfNeeded called')

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
