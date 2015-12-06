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
      'container.network.attached',
      'container.network.attach-failed',
      'dock.removed'
    ],
    publishedEvents: [
      'instance.created',
      'instance.deleted',
      'instance.updated'
    ],
    queues: [
      'cluster-deprovision',
      'cluster-provision',
      'create-image-builder-container',
      'create-instance-container',
      'delete-instance',
      'delete-instance-container',
      'deploy-instance',
      'metis-github-event',
      'on-image-builder-container-create',
      'on-image-builder-container-die',
      'on-instance-container-create',
      'on-instance-container-die',
      'pull-instance-image',
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
    'create-image-builder-container',
    'delete-instance',
    'delete-instance-container',
    'container.network.attached',
    'container.network.attach-failed',
    'on-image-builder-container-create',
    'on-image-builder-container-die',
    'on-instance-container-create',
    'on-instance-container-die',
    'start-instance-container',
    'stop-instance-container'
  ]
  this.workers.forEach(function (workerQueueName) {
    log.trace('RabbitMQ.prototype.loadWorkers ' + workerQueueName)
    self.hermesClient.subscribe(workerQueueName, require('workers/' + workerQueueName).worker)
  })
  // slowly move workers over to ponos style
  var ponosTasks = this.ponosTasks = {
    'create-instance-container': require('workers/create-instance-container'),
    'pull-instance-image': require('workers/pull-instance-image'),
    'dock.removed': require('workers/dock.removed')
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
  this.hermesClient.close(function () {
    log.trace('RabbitMQ.prototype.close complete')
    cb.apply(this, arguments)
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
  data.deploymentUuid = uuid.v4()
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
    'dockerHost',
    'instanceId',
    'sessionUserGithubId'
  ]
  this._validate(data, requiredKeys, 'stopInstanceContainer')
  this.hermesClient.publish('stop-instance-container', data)
}

/**
 * create a delete-instance job and insert it into queue
 * @param {Object} data
 */
RabbitMQ.prototype.deleteInstance = function (data) {
  log.info({
    tx: true,
    instance: keypather.get(data, 'instance'),
    sessionUserId: keypather.get(data, 'sessionUserId')
  }, 'RabbitMQ.prototype.deleteInstance')
  var requiredKeys = [
    'instanceId',
    'sessionUserId'
  ]
  this._validate(data, requiredKeys, 'deleteInstance')
  this.hermesClient.publish('delete-instance', data)
}

/**
 * create a delete-instance-container job and insert it into queue
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
    'ownerGithubId'
  ]
  this._validate(data, requiredKeys, 'deleteInstanceContainer')
  this.hermesClient.publish('delete-instance-container', data)
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
 * create an cluster-provision job and insert it into queue
 * @param {Object} data
 */
RabbitMQ.prototype.publishClusterProvision = function (data) {
  log.info({
    tx: true,
    data: data
  }, 'RabbitMQ.prototype.publishClusterProvision')
  var requiredKeys = [
    'githubId'
  ]
  this._validate(data, requiredKeys, 'publishClusterProvision')
  this.hermesClient.publish('cluster-provision', data)
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
 * Enqueues a job for pulling an image for an instance
 * @param {Object} data job data
 * @param {Object} data.instanceId instance id
 * @param {Object} data.imagePullId pull id
 */
RabbitMQ.prototype.pullInstanceImage = function (data) {
  var requiredKeys = [
    'instanceId',
    'buildId',
    'sessionUserGithubId',
    'ownerUsername'
  ]
  this._validate(data, requiredKeys, 'pullInstanceImage')
  // toString objectIds
  data.instanceId = data.instanceId.toString()
  this.hermesClient.publish('pull-instance-image', data)
}
