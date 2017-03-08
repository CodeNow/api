/**
 * This worker should
 *  * fetch the contextVersion associated with this build
 *  * fetch build logs & update contextVersion
 *  * emit instance updates
 *  * dealloc image builder network
 *
 * @module lib/workers/build.container.died
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

const ContainerImageBuilderDied = {}

module.exports = ContainerImageBuilderDied

ContainerImageBuilderDied.jobSchema = joi.object({
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
}).unknown().required()

class Worker {
  constructor (job) {
    this.host = job.host
    this.id = job.id
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
    return Promise.try(this._clearBuildResources.bind(this)).bind(this)
      .then(this._updateModelsAndGetUpdatedContextVersions)
      .then(this._emitUpdateAndGetInstances)
      .spread(this._updateAndGetAutoDeployedInstances)
      .then(this._filterOutAndKillIsolatedInstances)
      .each((instance) => {
        let ports = keypather.get(this, 'inspectImageData.Config.ExposedPorts')
        if (!ports) { return }
        ports = Object.keys(ports).map((portAndProtocol) => {
          return portAndProtocol.split('/')[0]
        })
        const update = {
          $set: {
            ports: ports
          }
        }
        const query = {
          _id: instance._id
        }

        this.log.trace({ query, update }, 'save ports')

        return Instance.findOneAndUpdateAsync(query, update)
      })
      .then(this._createContainersIfSuccessful)
  }

  /**
   * @return {undefined}
   */
  _clearBuildResources () {
    rabbitMQ.clearContainerMemory({ containerId: this.id })
  }

  /**
   * @return {Promise}
   * @resolves {ContextVersion[]}
   */
  _updateModelsAndGetUpdatedContextVersions () {
    if (this._isSuccessfulBuild()) {
      return this._pushAndUpdateSuccessfulBuild()
    }

    return this._reportAndUpdateFailedBuild()
  }

  /**
   * @return {Promise}
   * @resolves {ContextVersion[]}
   */
  _pushAndUpdateSuccessfulBuild () {
    rabbitMQ.pushImage({
      dockerHostUrl: this.host,
      imageTag: this.dockerImageTag
    })

    return BuildService.updateSuccessfulBuild(this.contextVersionBuildId)
  }

  /**
   * @return {Promise}
   * @resolves {ContextVersion[]}
   */
  _reportAndUpdateFailedBuild () {
    const errorMessage = this._isTimedOutBuild() ? 'timed out' : undefined
    this._reportBuildFailure()

    return BuildService.updateFailedBuild(this.contextVersionBuildId, errorMessage)
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
    const log = this.log.child({ method: '_reportBuildFailure' })
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
        }

        this.log.trace('manual update, using normal list')
        return instances
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
  _handleAutoDeploy (contextVersions) {
    const log = this.log.child({ contextVersions, method: 'handleAutoDeploy' })
    log.info('_handleAutoDeploy called')
    // this code is necessary for the autodeploy flow
    // in case `triggeredAction.manual === false` then we need to find instances and patch them
    // with the new completed build
    // call updateInstance if triggeredAction wasn't manual
    return Promise.try(() => {
      if (!contextVersions || !contextVersions[0]) { return [] }

      const contextVersion = contextVersions[0]
      log.trace({ contextVersion }, 'process contextVersion')
      const triggeredActionName = keypather.get(contextVersion, 'build.message')
      const triggeredAction = keypather.get(contextVersion, 'build.triggeredAction') || {}
      const triggeredACV = triggeredAction.appCodeVersion || {}
      const isManualAction = triggeredAction.manual
      const isAutoDeploy = !isManualAction && triggeredActionName === 'autodeploy'

      if (!isAutoDeploy) { return [] }

      return InstanceService.updateBuildByRepoAndBranch(contextVersion, triggeredACV.repo, triggeredACV.branch)
        .tap(this._emitDeployedIfExists.bind(this))
    })
  }

  /**
   * @param  {Instance[]} instances
   * @return {Promise}
   * @resolves {undefined}
   */
  _emitDeployedIfExists (instances) {
    const log = this.log.child({ instances, method: '_emitDeployedIfExists' })
    log.info('_emitDeployedIfExists called')
    if (!instances) { return }

    instances.forEach((instance) => {
      rabbitMQ.instanceDeployed({
        instanceId: keypather.get(instance, '_id.toString()'),
        cvId: keypather.get(instance, 'contextVersion._id.toString()')
      })
    })
  }

  /**
   * create instance container jobs if the build was successful
   * @param  {Instance[]]} instances array of instance docs
   */
  _createContainersIfSuccessful (instances) {
    const log = this.log.child({ instances, method: '_createContainersIfSuccessful' })
    log.info('_createContainersIfSuccessful called')
    if (!this._isSuccessfulBuild()) { return }

    instances.forEach(this._createContainerForInstance.bind(this))
  }

  /**
   * @param  {Instance[]} instance
   * @return {undefined}
   */
  _createContainerForInstance (instance) {
    const isManualBuild = keypather.get(instance, 'contextVersion.build.triggeredAction.manual')
    // happens when instance was forked and builds was already built successfully
    if (!isManualBuild) {
      rabbitMQ.instanceDeployed({
        instanceId: keypather.get(instance, '_id.toString()'),
        cvId: keypather.get(instance, 'contextVersion._id.toString()')
      })
    }

    rabbitMQ.createInstanceContainer({
      contextVersionId: instance.contextVersion._id.toString(),
      instanceId: instance._id.toString(),
      ownerUsername: this.ownerUsername,
      sessionUserGithubId: this.sessionUserGithubId
    })
  }

  /**
   * Will loop through instances, fetching their isolations and if they are the isolation
   * group master they will kill the isolation
   * @param {Instance[]} instances array of instance docs
   * @returns {Promise}
   * @resolves {Instance[]]} - Returns an array of instances which were not part of a kill trigger
   * @private
   */
  _filterOutAndKillIsolatedInstances (instances) {
    const log = this.log.child({ method: '_filterOutAndKillIsolatedInstances' })
    log.trace('_filterOutAndKillIsolatedInstances called')

    return Promise.filter(instances, this._filterAndKillIfIsolationMaster.bind(this))
  }

  /**
   * @param  {Instane} instance
   * @return {Promise}
   * @resolves {Boolean}
   */
  _filterAndKillIfIsolationMaster (instance) {
    const log = this.log.child({ instance, method: '_filterOutAndKillIsolatedInstances' })
    log.info({ instance }, '_filterAndKillIfIsolationMaster called')
    const isIsolationMaster = instance.isolated && instance.isIsolationGroupMaster

    if (!isIsolationMaster) { return true }

    return Isolation.findOneAsync({ _id: instance.isolated, redeployOnKilled: true })
      .then(this._filterAndKillIfIsolationExists.bind(this, instance))
  }

  /**
   * @param  {Instane} instance
   * @param  {Isolation} isolation
   * @return {Boolean}
   */
  _filterAndKillIfIsolationExists (instance, isolation) {
    const log = this.log.child({ instance, isolation, method: '_filterAndKillIfIsolationExists' })
    log.info({ isolation }, 'isolation search results')
    if (!isolation) { return true }

    rabbitMQ.killIsolation({ isolationId: instance.isolated.toString(), triggerRedeploy: true })

    return false
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
    inspectData: joi.object({
      Config: joi.object({
        Labels: joi.object({
          'contextVersion.build._id': joi.string().required(),
          'ownerUsername': joi.string().required(),
          'sessionUserGithubId': joi.number().required()
        }).unknown().required()
      }).unknown().required()
    }).unknown().required()
  }).unknown().required()
}
