'use strict'
require('loadenv')()
const isEmpty = require('101/is-empty')
const keypather = require('keypather')()
const WorkerStopError = require('error-cat/errors/worker-stop-error')

const ContextVersion = require('../models/mongo/context-version')
const ClusterBuild = require('../models/mongo/cluster-build')
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
      .then(ClusterBuild.setStateToDeploying(this.job.clusterBuildId))
      .then(this._publishClusterClusterBuildBuilt)
      .catch(ClusterBuild.setStateToError)
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
    return {
      envs: this._getEnvsFromInstance(instance),
      image: instance.contextVersion.build.dockerTag,
      memorySoftLimit: ContextVersion.getUserContainerMemoryLimit(instance.contextVersion.userContainerMemoryInBytes),
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
    const ports = keypather.get(instance, 'ports')

    if (!ports) {
      return []
    }

    return Object.keys(ports).map((portAndProtocol) => {
      // {String} portAndProtocol: '8080/TCP'
      const portAndProtocolSplit = portAndProtocol.split('/')
      const port = parseInt(portAndProtocolSplit[0], 10)
      const protocol = portAndProtocolSplit[1]

      return {
        port,
        protocol
      }
    })
  }

  /**
   * @param {Instance} instance
   * @returns {Object[]}
   * @returns {String} name: name of env varible
   * @returns {String} value: value of env varible
   */
  _getEnvsFromInstance (instance) {
    const envs = instance.env || []

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

  _populateClusterBuildWithSpecifications (clusterBuild) {
    return Promise.map(clusterBuild.instances, (instance) => {
      return Instance.findByIdAsync(instance.instanceId)
    })
    .map(this._convertInstanceToSpecification).bind(this)
    .then((instances) => {
      return Object.assign({}, clusterBuild, { instances })
    })
  }

  _publishClusterClusterBuildBuilt (clusterBuild) {
    return publisher.publishClusterClusterBuildBuilt({
      clusterBuild
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
    clusterBuildId: joi.string().required()
  })
}
