'use strict'
require('loadenv')()
const isEmpty = require('101/is-empty')
const Promise = require('bluebird')
const WorkerStopError = require('error-cat/errors/worker-stop-error')

const ClusterBuild = require('../models/mongo/cluster-build')
const ContextVersion = require('../models/mongo/context-version')
const Instance = require('../models/mongo/instance')
const joi = require('../utils/joi')
const logger = require('../logger')
const publisher = require('../models/rabbitmq/index.js')

class Worker {
  constructor (job) {
    this.job = job

    this.log = logger.child({
      job,
      module: 'clusterBuildComplete'
    })
  }

  /**
   * @returns {Promise}
   */
  task () {
    return ClusterBuild.setStateToBuilt(this.job.clusterBuildId).bind(this)
      .catch(ClusterBuild.IncorrectStateError, this._stopWorker)
      .then(this._populateClusterBuildWithSpecifications)
      .then(this._setClusterBuildStateToDeploying)
      .then(this._publishClusterBuildBuilt)
      .catch(this._setClusterBuildStateToError)
  }

  /**
   * @param {Instance} instance
   * @returns {Object[]}
   * @returns {String} name
   * @returns {String} image
   * @returns {String} memorySoftLimit
   * @returns {Number} ports[].port: port to expose
   * @returns {String} ports[].protocol: protocal of port
   * @returns {String} envs[].name: name of env varible
   * @returns {String} envs[].value: value of env varible
   */
  _convertInstanceToSpecification (instance) {
    const envs = this._getEnvsFromInstance(instance)
    return {
      envs: envs,
      image: instance.contextVersion.build.dockerTag,
      memorySoftLimit: ContextVersion.getUserContainerMemoryLimit(instance.contextVersion),
      name: instance.lowerName,
      ports: this._getPortsFromInstance(instance)
    }
  }

  /**
   * @param {Instance} instance
   * @returns {Object[]}
   * @returns {Number} port: port to expose
   * @returns {String} protocol: protocal of port
   */
  _getPortsFromInstance (instance) {
    return instance.ports || []
  }

  /**
   * @param {Instance} instance
   * @returns {Object[]}
   * @returns {String} name: name of env varible
   * @returns {String} value: value of env varible
   */
  _getEnvsFromInstance (instance) {
    const envs = instance.env

    if (isEmpty(envs)) {
      return []
    }

    return envs.map((envString) => {
      const splitEnv = envString.split('=')
      return {
        name: splitEnv[0],
        value: splitEnv[1]
      }
    })
  }

  /**
   * @param {ClusterBuild} clusterBuild
   * @returns {Promise}
   * @resolves {ClusterBuild} clusterBuild populated with specifications
   */
  _populateClusterBuildWithSpecifications (clusterBuild) {
    return Promise.map(clusterBuild.instanceIds, (instanceId) => {
      return Instance.findByIdAsync(instanceId)
    }).bind(this)
    .map((instance) => {
      return instance.toJSON()
    })
    .map(this._convertInstanceToSpecification)
    .then((specifications) => {
      return Object.assign({}, clusterBuild, { specifications })
    })
  }

  /**
   * @param {ClusterBuild} clusterBuild
   * @returns {Promise}
   * @resolves {ClusterBuild} clusterBuild with deploying state
   */
  _setClusterBuildStateToDeploying (clusterBuild) {
    return ClusterBuild.setStateToDeploying(clusterBuild)
  }

  /**
   * @param {ClusterBuild} clusterBuild
   * @returns {Promise}
   */
  _publishClusterBuildBuilt (clusterBuild) {
    console.log(JSON.stringify(clusterBuild.specifications), 'ca;;ed')
    return publisher.publishClusterBuildBuilt({
      clusterBuild
    })
  }

  /**
   * @param {Error} err
   * @returns {Promise}
   */
  _setClusterBuildStateToError (err) {
    if (err instanceof WorkerStopError) {
      throw err
    }

    return ClusterBuild.setStateToError(this.job.clusterBuildId, err)
      .then(this._stopWorker)
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
    clusterBuildId: joi.string().required()
  })
}
