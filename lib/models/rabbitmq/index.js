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
      'dock.removed'
    ],
    publishedEvents: [
      'container.image-builder.started',
      'instance.created',
      'instance.deleted',
      'instance.updated'
    ],
    queues: [
      'asg.create',
      'asg.instance.terminate',
      'cluster-deprovision',
      'create-image-builder-container',
      'create-instance-container',
      'deploy-instance',
      'instance.container.delete',
      'instance.container.redeploy',
      'instance.delete',
      'instance.rebuild',
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
    'container.network.attached',
    'create-image-builder-container',
    'on-image-builder-container-die',
    'start-instance-container'
  ]
  this.workers.forEach(function (workerQueueName) {
    log.trace('RabbitMQ.prototype.loadWorkers ' + workerQueueName)
    self.hermesClient.subscribe(workerQueueName, require('workers/' + workerQueueName).worker)
  })
  // with haste move workers over to ponos style
  var ponosTasks = this.ponosTasks = {
    'container.image-builder.started': require('workers/container.image-builder.started'),
    'container.life-cycle.started': require('workers/container.life-cycle.started'),
    'create-instance-container': require('workers/create-instance-container'),
    'dock.removed': require('workers/dock.removed'),
    'instance.container.delete': require('workers/instance.container.delete'),
    'instance.container.redeploy': require('workers/instance.container.redeploy'),
    'instance.delete': require('workers/instance.delete'),
    'instance.rebuild': require('workers/instance.rebuild'),
    'on-image-builder-container-create': require('workers/on-image-builder-container-create'),
    'on-instance-container-create': require('workers/instance.container.created'),
    'on-instance-container-die': require('workers/instance.container.died'),
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
    'dockerContainer',
    'dockerHost',
    'instanceId',
    'ownerUsername',
    'sessionUserGithubId',
    'tid'
  ]
  this._validate(data, requiredKeys, 'startInstanceContainer')
  this.hermesClient.publish('start-instance-container', data)
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
    // NOTE: instanceMasterBranch can be null because non-repo containers has no branches
    'ownerGithubId',
    'ownerGithubUsername'
  ]
  this._validate(data, requiredKeys, 'instance.container.delete')
  this.hermesClient.publish('instance.container.delete', data)
}

/**
 * create a create-image-builder-container job and insert it into queue
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
  this.hermesClient.publish('create-image-builder-container', data)
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
 * Enqueues a job for the given github webhook event.
 * @param {string} deliveryId Unique id for the webhook event.
 * @param {string} eventType The event type.
 * @param {object} payload The data body for the event.
 */
RabbitMQ.prototype.publishGithubEvent = function (deliveryId, eventType, payload) {
  this.hermesClient.publish('metis-github-event', {
    deliveryId: deliveryId,
    eventType: eventType,
    recordedAt: parseInt(new Date().getTime() / 1000, 10),
    payload: payload
  })
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
