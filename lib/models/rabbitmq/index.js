/**
 * RabbitMQ job management
 * @module lib/models/rabbitmq/index
 */
'use strict'

require('loadenv')()

var async = require('async')
var Boom = require('dat-middleware').Boom
var exists = require('101/exists')
var Hermes = require('runnable-hermes')
var keypather = require('keypather')()
var ponos = require('ponos')
var uuid = require('node-uuid')

var logger = require('middlewares/logger')(__filename)
var log = logger.log

/**
 * @class
 */
function RabbitMQ () {
  log.info('RabbitMQ constructor')
  this.hermesClient = null
}

module.exports = new RabbitMQ()

/**
 * Initiate connection to RabbitMQ server
 * Can be run synchronously, publish/subscribe invokations will be queued
 * Optional callback behavior
 * @param {Function} cb - optional callback
 * @return null
 */
RabbitMQ.prototype.connect = function (cb) {
  var opts = {
    name: 'api',
    heartbeat: 10,
    hostname: process.env.RABBITMQ_HOSTNAME,
    password: process.env.RABBITMQ_PASSWORD,
    port: process.env.RABBITMQ_PORT,
    username: process.env.RABBITMQ_USERNAME,
    subscribedEvents: [
      'container.image-builder.started',
      'container.life-cycle.started',
      'container.network.attached',
      'dock.removed',
      'docker.events-stream.disconnected'
    ],
    publishedEvents: [
      'container.image-builder.started',
      'context-version.deleted',
      'dock.removed',
      'instance.created',
      'instance.deleted',
      'instance.deployed',
      'instance.updated'
    ],
    queues: [
      'asg.create',
      'asg.instance.terminate',
      'cluster-deprovision',
      'container.image-builder.create',
      'container.resource.update',
      'context-version.delete',
      'create-instance-container',
      'deploy-instance',
      'instance.container.delete',
      'instance.container.redeploy',
      'instance.delete',
      'instance.kill',
      'instance.rebuild',
      'instance.restart',
      'isolation.stop',
      'metis-github-event',
      'on-image-builder-container-create',
      'on-image-builder-container-die',
      'on-instance-container-create',
      'on-instance-container-die',
      'start-instance-container',
      'stop-instance-container'
    ]
  }
  log.info(opts, 'RabbitMQ.prototype.connect')
  this.hermesClient = Hermes.hermesSingletonFactory(opts)
  this.hermesClient.on('error', this._handleFatalError)
  this.hermesClient.connect(cb)
}

// we got rabbitmq error
// solution is to to crash process (it would be restarted automatically)
RabbitMQ.prototype._handleFatalError = function (err) {
  log.fatal({
    tx: true,
    err: err
  }, 'RabbitMQ.prototype.connect hermes error')
  process.exit(1)
}

/**
 * Load all workers and subscribe to queues
 * Does not need to wait for hermesClient.on('ready'), hermes queues subscriptions
 * @return null
 */
RabbitMQ.prototype.loadWorkers = function () {
  log.info('RabbitMQ.prototype.loadWorkers')
  var self = this
  this.workers = [
    'container.network.attached'
  ]
  this.workers.forEach(function (workerQueueName) {
    log.trace('RabbitMQ.prototype.loadWorkers ' + workerQueueName)
    self.hermesClient.subscribe(workerQueueName, require('workers/' + workerQueueName).worker)
  })
  // with haste move workers over to ponos style
  var ponosTasks = this.ponosTasks = {
    'container.image-builder.create': require('workers/container.image-builder.create'),
    'container.image-builder.started': require('workers/container.image-builder.started'),
    'container.life-cycle.started': require('workers/container.life-cycle.started'),
    'container.resource.update': require('workers/container.resource.update'),
    'context-version.delete': require('workers/context-version.delete'),
    'create-instance-container': require('workers/create-instance-container'),
    'dock.removed': require('workers/dock.removed'),
    'docker.events-stream.disconnected': require('workers/docker.events-stream.disconnected'),
    'instance.container.delete': require('workers/instance.container.delete'),
    'instance.container.redeploy': require('workers/instance.container.redeploy'),
    'instance.delete': require('workers/instance.delete'),
    'instance.kill': require('workers/instance.kill'),
    'instance.rebuild': require('workers/instance.rebuild'),
    'instance.restart': require('workers/instance.restart'),
    'isolation.stop': require('workers/isolation.stop'),
    'on-image-builder-container-create': require('workers/on-image-builder-container-create'),
    'on-image-builder-container-die': require('workers/on-image-builder-container-die'),
    'on-instance-container-create': require('workers/instance.container.created'),
    'on-instance-container-die': require('workers/instance.container.died'),
    'start-instance-container': require('workers/instance.start'),
    'stop-instance-container': require('workers/instance.stop')
  }
  // ponos: subscribe to queues
  var ponosServer = this.ponosServer = new ponos.Server({
    hermes: this.hermesClient,
    log: log
  })
  ponosServer.setAllTasks(ponosTasks)
  Object.keys(ponosTasks).forEach(ponosServer._subscribe.bind(ponosServer))
}

/**
 * Unsubscribe from queues
 * @param {Function} cb
 * @return null
 */
RabbitMQ.prototype.unloadWorkers = function (cb) {
  var self = this
  log.info('RabbitMQ.prototype.unloadWorkers')
  if (!this.hermesClient) {
    log.warn('RabbitMQ.prototype.unloadWorkers !hermesClient')
    return cb()
  }
  if (!this.workers) {
    // Should only ever occur if API exits immediately upon starting
    // before invoking `loadWorkers`
    log.warn('RabbitMQ.prototype.unloadWorkers !this.workers')
    return cb()
  }
  var ponosTasks = this.ponosTasks
  var ponosServer = this.ponosServer
  async.each(this.workers, function (workerQueueName, cb) {
    log.trace('RabbitMQ.prototype.unloadWorkers ' + workerQueueName)
    self.hermesClient.unsubscribe(workerQueueName, null, cb)
  }, function (err) {
    log.trace('RabbitMQ.prototype.unloadWorkers complete')
    if (err) { return cb(err) }
    async.each(Object.keys(ponosTasks), function (workerQueueName, cb) {
      ponosServer._unsubscribe(workerQueueName, null).asCallback(cb)
    }, cb)
  })
}

/**
 * Disconnect
 * @param {Function} cb
 * @return null
 */
RabbitMQ.prototype.close = function (cb) {
  log.info('RabbitMQ.prototype.close')
  if (!this.hermesClient) {
    return cb()
  }
  this.hermesClient.close(function (err) {
    if (err) {
      log.error(err, 'RabbitMQ.prototype.close complete error')
      return cb(err)
    }
    log.trace('RabbitMQ.prototype.close complete')
    cb()
  })
}

/**
 * Validate new job data
 * @param {Object} data to be validated
 * @param {Array} required keys that should be presented in the `data`
 * @param {String} methodName that initiated validation. Used for logs
 */
RabbitMQ.prototype._validate = function (data, requiredKeys, methodName) {
  requiredKeys.forEach(function (keypath) {
    var val = keypather.get(data, keypath)
    if (!exists(val)) {
      log.error({
        tx: true,
        data: data,
        requiredKeys: requiredKeys
      }, 'RabbitMQ.prototype.' + methodName + ' missing required keys')
      var err = Boom.badRequest('Validation failed: "' + keypath + '" is required')
      throw err
    }
  })
}

/**
 * create a start-instance-container job and insert it into queue
 * @param {Object} data
 */
RabbitMQ.prototype.startInstanceContainer = function (data) {
  log.info({
    tx: true,
    data: data
  }, 'RabbitMQ.prototype.startInstanceContainer')
  var requiredKeys = [
    'containerId',
    'instanceId',
    'sessionUserGithubId',
    'tid'
  ]
  this._validate(data, requiredKeys, 'startInstanceContainer')
  this.hermesClient.publish('start-instance-container', data)
}

/**
 * create a instance.restart job and insert it into queue
 * @param {Object} data
 */
RabbitMQ.prototype.restartInstance = function (data) {
  log.info({
    tx: true,
    data: data
  }, 'RabbitMQ.prototype.startInstanceContainer')
  var requiredKeys = [
    'containerId',
    'instanceId',
    'sessionUserGithubId',
    'tid'
  ]
  this._validate(data, requiredKeys, 'instance.restart')
  this.hermesClient.publish('instance.restart', data)
}

/**
 * create a create-instance-container job and insert it into queue
 * @param {Object} data
 */
RabbitMQ.prototype.createInstanceContainer = function (data) {
  log.info({
    tx: true,
    data: data
  }, 'RabbitMQ.prototype.createInstanceContainer')
  // used to trace flow across multiple workers in loggly
  if (!data.deploymentUuid) {
    data.deploymentUuid = uuid.v4()
  }
  var requiredKeys = [
    'contextVersionId',
    'instanceId',
    'ownerUsername',
    'sessionUserGithubId'
  ]
  this._validate(data, requiredKeys, 'createInstanceContainer')
  log.info({
    tx: true,
    data: data
  }, 'RabbitMQ.prototype.createInstanceContainer +deploymentUuid')
  this.hermesClient.publish('create-instance-container', data)
}

/**
 * create a instance.container.redeploy job and insert it into queue
 * @param {Object} data
 */
RabbitMQ.prototype.redeployInstanceContainer = function (data) {
  log.info({
    tx: true,
    data: data
  }, 'RabbitMQ.prototype.redeployInstanceContainer')
  var requiredKeys = [
    'instanceId',
    'sessionUserGithubId'
  ]
  this._validate(data, requiredKeys, 'redeployInstanceContainer')
  log.info({
    tx: true,
    data: data
  }, 'RabbitMQ.prototype.redeployInstanceContainer +deploymentUuid')
  this.hermesClient.publish('instance.container.redeploy', data)
}

/**
 * create a stop-instance-container job and insert it into queue
 * @param {Object} data
 */
RabbitMQ.prototype.stopInstanceContainer = function (data) {
  log.info({
    tx: true,
    data: data
  }, 'RabbitMQ.prototype.stopInstanceContainer')
  var requiredKeys = [
    'containerId',
    'instanceId',
    'sessionUserGithubId'
  ]
  this._validate(data, requiredKeys, 'stopInstanceContainer')
  this.hermesClient.publish('stop-instance-container', data)
}

/**
 * create a instance.delete job and insert it into queue
 * @param {Object} data
 */
RabbitMQ.prototype.deleteInstance = function (data) {
  log.info({
    tx: true,
    instance: keypather.get(data, 'instance'),
    sessionUserId: keypather.get(data, 'sessionUserId')
  }, 'RabbitMQ.prototype.deleteInstance')
  var requiredKeys = [
    'instanceId'
  ]
  this._validate(data, requiredKeys, 'instance.delete')
  this.hermesClient.publish('instance.delete', data)
}

/**
 * create a instance.container.delete job and insert it into queue
 * NOTE: instanceMasterBranch can be null because non-repo containers have no branches
 * NOTE: isolated and isIsolationGroupMaster can be null
 * @param {Object} data
 */
RabbitMQ.prototype.deleteInstanceContainer = function (data) {
  log.info({
    tx: true,
    data: data
  }, 'RabbitMQ.prototype.deleteInstanceContainer')
  var requiredKeys = [
    'container',
    'container.dockerContainer',
    'instanceName',
    'instanceShortHash',
    'instanceMasterPod',
    'ownerGithubId',
    'ownerGithubUsername'
  ]
  this._validate(data, requiredKeys, 'instance.container.delete')
  this.hermesClient.publish('instance.container.delete', data)
}

/**
 * create a `container.image-builder.create` job and insert it into queue
 * @param {Object} data
 */
RabbitMQ.prototype.createImageBuilderContainer = function (data) {
  log.info({
    tx: true,
    data: data
  }, 'RabbitMQ.prototype.createImageBuilderContainer')
  var requiredKeys = [
    'manualBuild',
    'sessionUserGithubId',
    'ownerUsername',
    'contextId',
    'contextVersionId',
    'noCache',
    'tid'
  ]
  this._validate(data, requiredKeys, 'createImageBuilderContainer')
  this.hermesClient.publish('container.image-builder.create', data)
}

/**
 * create an instance.rebuild job
 * @param {Object} data
 */
RabbitMQ.prototype.publishInstanceRebuild = function (data) {
  log.info({
    tx: true,
    data: data
  }, 'RabbitMQ.prototype.publishInstanceRebuild')
  var requiredKeys = [
    'instanceId'
  ]
  this._validate(data, requiredKeys, 'instance.rebuild')
  this.hermesClient.publish('instance.rebuild', data)
}

/**
 * create an asg.create job and insert it into queue
 * @param {Object} data
 */
RabbitMQ.prototype.publishASGCreate = function (data) {
  log.info({
    tx: true,
    data: data
  }, 'RabbitMQ.prototype.publishASGCreate')
  var requiredKeys = [
    'githubId'
  ]
  this._validate(data, requiredKeys, 'publishASGCreate')
  this.hermesClient.publish('asg.create', data)
}

/**
 * create an cluster-deprovision job and insert it into queue
 * @param {Object} data
 */
RabbitMQ.prototype.publishClusterDeprovision = function (data) {
  log.info({
    tx: true,
    data: data
  }, 'RabbitMQ.prototype.publishClusterDeprovision')
  var requiredKeys = [
    'githubId'
  ]
  this._validate(data, requiredKeys, 'publishClusterDeprovision')
  this.hermesClient.publish('cluster-deprovision', data)
}

/**
 * create a instance-updated job and insert it into queue
 * @param {Object} data
 */
RabbitMQ.prototype.instanceUpdated = function (data) {
  log.info({
    tx: true,
    instance: keypather.get(data, 'instance')
  }, 'RabbitMQ.prototype.instanceUpdated')
  var requiredKeys = [
    'instance'
  ]
  this._validate(data, requiredKeys, 'instanceUpdated')
  this.hermesClient.publish('instance.updated', data)
}

/**
 * create a instance-updated job and insert it into queue
 * @param {Object} data
 */
RabbitMQ.prototype.instanceCreated = function (data) {
  log.info({
    tx: true,
    instance: keypather.get(data, 'instance')
  }, 'RabbitMQ.prototype.instanceCreated')
  var requiredKeys = [
    'instance'
  ]
  this._validate(data, requiredKeys, 'instanceCreated')
  this.hermesClient.publish('instance.created', data)
}

/**
 * create a instance-deleted job and insert it into queue
 * @param {Object} data
 */
RabbitMQ.prototype.instanceDeleted = function (data) {
  log.info({
    tx: true,
    instance: keypather.get(data, 'instance')
  }, 'RabbitMQ.prototype.instanceDeleted')
  var requiredKeys = ['instance']
  this._validate(data, requiredKeys, 'instanceDeleted')
  this.hermesClient.publish('instance.deleted', data)
}

/**
 * create a instance.deployed job and insert it into queue
 * @param {Object} data
 */
RabbitMQ.prototype.instanceDeployed = function (data) {
  log.info({
    tx: true,
    data: data
  }, 'RabbitMQ.prototype.instanceDeployed')
  var requiredKeys = ['instanceId', 'cvId']
  this._validate(data, requiredKeys, 'instance.deployed')
  this.hermesClient.publish('instance.deployed', data)
}

/**
 * create a asg.instance.terminate job and insert it into queue
 * @param {Object} data
 */
RabbitMQ.prototype.asgInstanceTerminate = function (data) {
  log.info({
    tx: true,
    ipAddress: data.ipAddress
  }, 'RabbitMQ.prototype.asgInstanceTerminate')
  var requiredKeys = ['ipAddress']
  this._validate(data, requiredKeys, 'asgInstanceTerminate')
  this.hermesClient.publish('asg.instance.terminate', data)
}

/**
 * Delete a context version
 * @param {Object} data
 * @param {Object} data.contextVersion - Context Version object
 */
RabbitMQ.prototype.deleteContextVersion = function (data) {
  log.info({
    tx: true,
    contextVersionId: keypather.get(data, 'contextVersionId')
  }, 'RabbitMQ.prototype.deleteContextVersion')
  var requiredKeys = [
    'contextVersionId'
  ]
  this._validate(data, requiredKeys, 'deleteContextVersion')
  this.hermesClient.publish('context-version.delete', data)
}

/**
 * Context version deleted event
 * @param {Object} data
 * @param {Object} data.contextVersion - Context Version object
 */
RabbitMQ.prototype.contextVersionDeleted = function (data) {
  log.info({
    tx: true,
    contextVersion: keypather.get(data, 'contextVersion')
  }, 'RabbitMQ.prototype.contextVersionDeleted')
  var requiredKeys = [
    'contextVersion'
  ]
  this._validate(data, requiredKeys, 'contextVerisonDeleted')
  this.hermesClient.publish('context-version.deleted', data)
}

/**
 * create container.image-builder.started job
 * @param {Object} data job data
 */
RabbitMQ.prototype.publishContainerImageBuilderStarted = function (data) {
  log.info({
    tx: true,
    job: data
  }, 'RabbitMQ.prototype.publishContainerImageBuilderStarted')
  var requiredKeys = ['inspectData']
  this._validate(data, requiredKeys, 'publishContainerImageBuilderStarted')
  this.hermesClient.publish('container.image-builder.started', data)
}

/**
 * create dock.removed job
 * @param {Object} data job data
 */
RabbitMQ.prototype.publishDockRemoved = function (data) {
  log.info({
    tx: true,
    job: data
  }, 'RabbitMQ.prototype.publishDockRemoved')
  var requiredKeys = ['githubId', 'host']
  this._validate(data, requiredKeys, 'publishDockRemoved')
  this.hermesClient.publish('dock.removed', data)
}

/**
 * create container.resource.update job
 * @param {Object} data job data
 */
RabbitMQ.prototype.updateContainerMemory = function (data) {
  log.info({
    tx: true,
    job: data
  }, 'RabbitMQ.prototype.updateContainerMemory')
  var requiredKeys = ['containerId', 'memoryInBytes']
  this._validate(data, requiredKeys, 'updateContainerMemory')
  this.hermesClient.publish('container.resource.update', data)
}

/**
 * Create a instance.kill job and insert it in the queue
 * @param {Object} data
 */
RabbitMQ.prototype.killInstanceContainer = function (data) {
  log.info({
    tx: true,
    data: data
  }, 'RabbitMQ.prototype.killInstanceContainer')
  var requiredKeys = [
    'containerId',
    'instanceId'
  ]
  this._validate(data, requiredKeys, 'killInstanceContainer')
  this.hermesClient.publish('instance.kill', data)
}


/**
 * Create a isolation.stop job and insert it in the queue
 * @param {Object} data
 */
RabbitMQ.prototype.stopIsolation = function (data) {
  log.info({
    tx: true,
    data: data
  }, 'RabbitMQ.prototype.stopIsolation')
  var requiredKeys = [
    'isolationId'
  ]
  this._validate(data, requiredKeys, 'stopIsolation')
  this.hermesClient.publish('isolation.stop', data)
}
