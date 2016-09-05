/**
 * RabbitMQ job management
 * @module lib/models/rabbitmq/index
 */
'use strict'

require('loadenv')()

var Boom = require('dat-middleware').Boom
var exists = require('101/exists')
var Publisher = require('ponos/lib/rabbitmq')
var keypather = require('keypather')()
var uuid = require('node-uuid')
var Hermes = require('runnable-hermes')
var Promise = require('bluebird')

var logger = require('middlewares/logger')(__filename)
var log = logger.log

/**
 * Module in charge of rabbitmq connection
 *  client and pubSub are singletons
 */
var _publisher = new Publisher({
  name: process.env.APP_NAME,
  hostname: process.env.RABBITMQ_HOSTNAME,
  port: process.env.RABBITMQ_PORT,
  username: process.env.RABBITMQ_USERNAME,
  password: process.env.RABBITMQ_PASSWORD
})

/**
 * Module in charge of rabbitmq connection
 *  client and pubSub are singletons
 */
function RabbitMQ () { }

module.exports = RabbitMQ
module.exports._publisher = _publisher

/**
 * Initiate connection to publisher server
 * @returns {Promise}
 * @resolves when connected to rabbit
 */
RabbitMQ.connect = function () {
  log.info('RabbitMQ.connect')
  return _publisher.connect()
    .then(function () {
      // TODO: remove when ponos asserts queues on connect
      return Promise.fromCallback(function (cb) {
        Hermes.hermesSingletonFactory({
          name: process.env.APP_NAME,
          hostname: process.env.RABBITMQ_HOSTNAME,
          password: process.env.RABBITMQ_PASSWORD,
          port: process.env.RABBITMQ_PORT,
          username: process.env.RABBITMQ_USERNAME,
          publishedEvents: [
            'instance.container.errored',
            'container.image-builder.started',
            'context-version.deleted',
            'dock.removed',
            'first.dock.created',
            'instance.created',
            'instance.deleted',
            'instance.deployed',
            'instance.updated',
            'organization.authorized',
            'user.authorized',
            'user.whitelisted'
          ]
        }).connect().on('ready', cb)
      })
    })
}

/**
 * disconnect connection to rabbit
 * @returns {Promise}
 * @resolves when disconnected to rabbit
 */
RabbitMQ.disconnect = function () {
  log.info('RabbitMQ.connect')
  return _publisher.disconnect()
}

/**
 * Validate new job data
 * @param {Object} data to be validated
 * @param {Array} required keys that should be presented in the `data`
 * @param {String} methodName that initiated validation. Used for logs
 */
RabbitMQ._validate = function (data, requiredKeys, methodName) {
  requiredKeys.forEach(function (keypath) {
    var val = keypather.get(data, keypath)
    if (!exists(val)) {
      log.error({
        data: data,
        requiredKeys: requiredKeys
      }, 'RabbitMQ.' + methodName + ' missing required keys')
      var err = Boom.badRequest('Validation failed: "' + keypath + '" is required')
      throw err
    }
  })
}

/**
 * create a start-instance-container job and insert it into queue
 * @param {Object} data
 */
RabbitMQ.startInstanceContainer = function (data) {
  log.info({
    data: data
  }, 'RabbitMQ.startInstanceContainer')
  var requiredKeys = [
    'containerId',
    'instanceId',
    'sessionUserGithubId'
  ]
  this._validate(data, requiredKeys, 'startInstanceContainer')
  _publisher.publishTask('start-instance-container', data)
}

/**
 * create a instance.restart job and insert it into queue
 * @param {Object} data
 */
RabbitMQ.restartInstance = function (data) {
  log.info({
    data: data
  }, 'RabbitMQ.startInstanceContainer')
  var requiredKeys = [
    'containerId',
    'instanceId',
    'sessionUserGithubId',
    'tid'
  ]
  this._validate(data, requiredKeys, 'instance.restart')
  _publisher.publishTask('instance.restart', data)
}

/**
 * create a create-instance-container job and insert it into queue
 * @param {Object} data
 */
RabbitMQ.createInstanceContainer = function (data) {
  log.info({
    data: data
  }, 'RabbitMQ.createInstanceContainer')
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
    data: data
  }, 'RabbitMQ.createInstanceContainer +deploymentUuid')
  _publisher.publishTask('create-instance-container', data)
}

/**
 * create a instance.container.redeploy job and insert it into queue
 * @param {Object} data
 */
RabbitMQ.redeployInstanceContainer = function (data) {
  log.info({
    data: data
  }, 'RabbitMQ.redeployInstanceContainer')
  const requiredKeys = [
    'instanceId',
    'sessionUserGithubId'
  ]
  this._validate(data, requiredKeys, 'redeployInstanceContainer')
  log.info({
    data: data
  }, 'RabbitMQ.redeployInstanceContainer +deploymentUuid')
  _publisher.publishTask('instance.container.redeploy', data)
}

/**
 * create a stop-instance-container job and insert it into queue
 * @param {Object} data
 */
RabbitMQ.stopInstanceContainer = function (data) {
  log.info({
    data: data
  }, 'RabbitMQ.stopInstanceContainer')
  var requiredKeys = [
    'containerId',
    'instanceId',
    'sessionUserGithubId'
  ]
  this._validate(data, requiredKeys, 'stopInstanceContainer')
  _publisher.publishTask('stop-instance-container', data)
}

/**
 * create a instance.delete job and insert it into queue
 * @param {Object} data
 */
RabbitMQ.deleteInstance = function (data) {
  log.info({
    instance: keypather.get(data, 'instance'),
    sessionUserId: keypather.get(data, 'sessionUserId')
  }, 'RabbitMQ.deleteInstance')
  var requiredKeys = [
    'instanceId'
  ]
  this._validate(data, requiredKeys, 'instance.delete')
  _publisher.publishTask('instance.delete', data)
}

/**
 * create a instance.container.delete job and insert it into queue
 * NOTE: instanceMasterBranch can be null because non-repo containers have no branches
 * NOTE: isolated and isIsolationGroupMaster can be null
 * @param {Object} data
 */
RabbitMQ.deleteInstanceContainer = function (data) {
  log.info({
    data: data
  }, 'RabbitMQ.deleteInstanceContainer')
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
  _publisher.publishTask('instance.container.delete', data)
}

/**
 * create a `container.image-builder.create` job and insert it into queue
 * @param {Object} data
 */
RabbitMQ.createImageBuilderContainer = function (data) {
  log.info({
    data: data
  }, 'RabbitMQ.createImageBuilderContainer')
  var requiredKeys = [
    'manualBuild',
    'sessionUserGithubId',
    'ownerUsername',
    'contextId',
    'contextVersionId',
    'contextVersionBuildId',
    'noCache',
    'tid'
  ]
  this._validate(data, requiredKeys, 'createImageBuilderContainer')
  _publisher.publishTask('container.image-builder.create', data)
}

/**
 * create an instance.rebuild job
 * @param {Object} data
 */
RabbitMQ.publishInstanceRebuild = function (data) {
  log.info({
    data: data
  }, 'RabbitMQ.publishInstanceRebuild')
  const requiredKeys = [
    'instanceId'
  ]
  this._validate(data, requiredKeys, 'instance.rebuild')
  _publisher.publishTask('instance.rebuild', data)
}

/**
 * create an asg.create job and insert it into queue
 * @param {Object} data
 */
RabbitMQ.publishASGCreate = function (data) {
  log.info({
    data: data
  }, 'RabbitMQ.publishASGCreate')
  const requiredKeys = [
    'githubId'
  ]
  this._validate(data, requiredKeys, 'publishASGCreate')
  _publisher.publishTask('asg.create', data)
}

/**
 * create a UserWhitelisted event.  This adds the value createdAt to the data
 *
 * @param {Object} data           - data model
 * @param {Object} data.githubId  - Whitelisted Org's Github Id
 *
 */
RabbitMQ.publishUserWhitelisted = function (data) {
  log.info({
    data: data
  }, 'RabbitMQ.publishUserWhitelisted')
  var requiredKeys = [
    'githubId',
    'orgName',
    'createdAt'
  ]
  this._validate(data, requiredKeys, 'publishUserWhitelisted')
  data.createdAt = Math.floor(new Date().getTime() / 1000)
  _publisher.publishEvent('user.whitelisted', data)
}

/**
 * create a instance-updated job and insert it into queue
 * @param {Object} data
 */
RabbitMQ.instanceUpdated = function (data) {
  log.info({
    instance: keypather.get(data, 'instance')
  }, 'RabbitMQ.instanceUpdated')
  var requiredKeys = [
    'instance'
  ]
  this._validate(data, requiredKeys, 'instanceUpdated')
  _publisher.publishEvent('instance.updated', data)
}

/**
 * create a instance-updated job and insert it into queue
 * @param {Object} data
 */
RabbitMQ.instanceCreated = function (data) {
  log.info({
    instance: keypather.get(data, 'instance')
  }, 'RabbitMQ.instanceCreated')
  var requiredKeys = [
    'instance'
  ]
  this._validate(data, requiredKeys, 'instanceCreated')
  _publisher.publishEvent('instance.created', data)
}

/**
 * create a instance-deleted job and insert it into queue
 * @param {Object} data
 */
RabbitMQ.instanceDeleted = function (data) {
  log.info({
    instance: keypather.get(data, 'instance')
  }, 'RabbitMQ.instanceDeleted')
  var requiredKeys = ['instance']
  this._validate(data, requiredKeys, 'instanceDeleted')
  _publisher.publishEvent('instance.deleted', data)
}

/**
 * create a instance.deployed job and insert it into queue
 * @param {Object} data
 */
RabbitMQ.instanceDeployed = function (data) {
  log.info({
    data: data
  }, 'RabbitMQ.instanceDeployed')
  var requiredKeys = ['instanceId', 'cvId']
  this._validate(data, requiredKeys, 'instance.deployed')
  _publisher.publishEvent('instance.deployed', data)
}

/**
 * create a first.dock.created job and insert it into queue
 * @param {Object} data
 */
RabbitMQ.firstDockCreated = function (data) {
  log.info({
    data: data
  }, 'RabbitMQ.instanceUpdated')
  var requiredKeys = [
    'githubId'
  ]
  this._validate(data, requiredKeys, 'firstDockCreated')
  _publisher.publishEvent('first.dock.created', data)
}

/**
 * create a asg.instance.terminate job and insert it into queue
 * @param {Object} data
 */
RabbitMQ.asgInstanceTerminate = function (data) {
  log.info({
    ipAddress: data.ipAddress
  }, 'RabbitMQ.asgInstanceTerminate')
  var requiredKeys = ['ipAddress']
  this._validate(data, requiredKeys, 'asgInstanceTerminate')
  _publisher.publishTask('asg.instance.terminate', data)
}

/**
 * Delete a context version
 * @param {Object} data
 * @param {Object} data.contextVersion - Context Version object
 */
RabbitMQ.deleteContextVersion = function (data) {
  log.info({
    contextVersionId: keypather.get(data, 'contextVersionId')
  }, 'RabbitMQ.deleteContextVersion')
  var requiredKeys = [
    'contextVersionId'
  ]
  this._validate(data, requiredKeys, 'deleteContextVersion')
  _publisher.publishTask('context-version.delete', data)
}

/**
 * Context version deleted event
 * @param {Object} data
 * @param {Object} data.contextVersion - Context Version object
 */
RabbitMQ.contextVersionDeleted = function (data) {
  log.info({
    contextVersion: keypather.get(data, 'contextVersion')
  }, 'RabbitMQ.contextVersionDeleted')
  var requiredKeys = [
    'contextVersion'
  ]
  this._validate(data, requiredKeys, 'contextVerisonDeleted')
  _publisher.publishEvent('context-version.deleted', data)
}

/**
 * create container.image-builder.started job
 * @param {Object} data job data
 */
RabbitMQ.publishContainerImageBuilderStarted = function (data) {
  log.info({
    job: data
  }, 'RabbitMQ.publishContainerImageBuilderStarted')
  var requiredKeys = ['inspectData']
  this._validate(data, requiredKeys, 'publishContainerImageBuilderStarted')
  _publisher.publishEvent('container.image-builder.started', data)
}

/**
 * create dock.removed job
 * @param {Object} data job data
 */
RabbitMQ.publishDockRemoved = function (data) {
  log.info({
    job: data
  }, 'RabbitMQ.publishDockRemoved')
  var requiredKeys = ['githubId', 'host']
  this._validate(data, requiredKeys, 'publishDockRemoved')
  _publisher.publishEvent('dock.removed', data)
}

/**
 * create container.resource.clear job
 * @param {Object} data job data
 */
RabbitMQ.clearContainerMemory = function (data) {
  log.info({
    job: data
  }, 'RabbitMQ.clearContainerMemory')
  var requiredKeys = ['containerId']
  this._validate(data, requiredKeys, 'clearContainerMemory')
  _publisher.publishTask('container.resource.clear', data)
}

/**
 * Create a instance.kill job and insert it in the queue
 * @param {Object} data
 */
RabbitMQ.killInstanceContainer = function (data) {
  log.info({
    data: data
  }, 'RabbitMQ.killInstanceContainer')
  var requiredKeys = [
    'containerId',
    'instanceId'
  ]
  this._validate(data, requiredKeys, 'killInstanceContainer')
  _publisher.publishTask('instance.kill', data)
}

/**
 * Create a isolation.kill job and insert it in the queue
 * @param {Object} data
 */
RabbitMQ.killIsolation = function (data) {
  log.info({
    data: data
  }, 'RabbitMQ.killIsolation')
  var requiredKeys = [
    'isolationId',
    'triggerRedeploy'
  ]
  this._validate(data, requiredKeys, 'killIsolation')
  _publisher.publishTask('isolation.kill', data)
}

/**
 * Create a isolation.redeploy job and insert it in the queue
 * @param {Object} data
 */
RabbitMQ.redeployIsolation = function (data) {
  log.info({
    data: data
  }, 'RabbitMQ.redeployIsolation')
  var requiredKeys = [
    'isolationId'
  ]
  this._validate(data, requiredKeys, 'redeployIsolation')
  _publisher.publishTask('isolation.redeploy', data)
}

/**
 * Create a 'isolation.match-commit' job
 *
 * Given an isolation group, match the commit of all instances with the
 * same repo and branch as the commit of the given instance.  For example, If
 * a group has 2 apis in the group  (1 for tests), it will update both of them
 * to the latest when any of these instances are updated.
 *
 * @param {Object}    data
 * @param {ObjectId}  data.isolationId         - Isolation ID
 * @param {ObjectId}  data.instancedId         - Instance ID
 * @param {Number}    data.sessionUserGithubId - Session user GithubId
 */
RabbitMQ.matchCommitInIsolationInstances = function (data) {
  log.info({
    data: data
  }, 'RabbitMQ.matchCommitWithIsolationMaster')
  var requiredKeys = [
    'isolationId',
    'instanceId',
    'sessionUserGithubId'
  ]
  this._validate(data, requiredKeys, 'matchCommitWithIsolationMaster')
  _publisher.publishTask('isolation.match-commit', data)
}

/**
 * Creates a `khronos:containers:delete` job.
 * @param {Object} data
 * @param {String} data.dockerHost - Docker Host IP
 * @param {String} data.containerId - Container id to delete
 */
RabbitMQ.khronosDeleteContainer = function (data) {
  log.info({
    data: data
  }, 'RabbitMQ.khronosDeleteContainer')
  var requiredKeys = [
    'dockerHost',
    'containerId'
  ]
  this._validate(data, requiredKeys, 'khronosDeleteContainer')
  _publisher.publishTask('khronos:containers:delete', data)
}

/**
 * Creates an organization and spins up a dock for that org
 *
 * @param {Object} data
 * @param {Number} data.githubId               - Github ID for Github Organization
 * @param {Object} data.creator                - User who added this org to Runnable
 * @param {Number} data.creator.githubId       - Github ID for the creator
 * @param {String} data.creator.githubUsername - Github username for the creator
 * @param {String} data.creator.email          - Email for the creator
 * @param {String} data.creator.created        - Date this was created
 */
RabbitMQ.publishOrganizationAuthorized = function (data) {
  log.info({
    data: data
  }, 'RabbitMQ.publishOrganizationAuthorized')
  const requiredKeys = [
    'githubId',
    'creator',
    'creator.githubId',
    'creator.githubUsername',
    'creator.email',
    'creator.created'
  ]
  this._validate(data, requiredKeys, 'publishOrganizationAuthorized')
  return _publisher.publishEvent('organization.authorized', data)
}

/**
 * Creates a Runnable user
 *
 * @param {Object} data
 * @param {Number} data.githubId - Github ID for Github User
 */
RabbitMQ.publishUserAuthorized = function (data) {
  log.info({
    data: data
  }, 'RabbitMQ.publishUserAuthorized')
  const requiredKeys = [
    'githubId',
    'accessToken'
  ]
  this._validate(data, requiredKeys, 'createUser')
  return _publisher.publishEvent('user.authorized', data)
}

/**
 * Creates a `instance.container.errored` job.
 * @param {Object} data
 * @param {String} data.instanceId  - instance to which container belongs
 * @param {String} data.containerId - Container id to delete
 * @param {String} data.error       - Container error that happened
 */
RabbitMQ.instanceContainerErrored = function (data) {
  log.info({
    data: data
  }, 'RabbitMQ.instanceContainerErrored')
  var requiredKeys = [
    'instanceId',
    'containerId',
    'error'
  ]
  this._validate(data, requiredKeys, 'instanceContainerErrored')
  _publisher.publishEvent('instance.container.errored', data)
}
