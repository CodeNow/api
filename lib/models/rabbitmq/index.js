/**
 * RabbitMQ publisher
 * @module lib/models/rabbitmq/index
 */
'use strict'
require('loadenv')()
const joi = require('joi')
const Publisher = require('ponos/lib/rabbitmq')
const cleanEnvKeys = require('logger/serializer-env').cleanEnvKeys

const schemas = require('models/rabbitmq/schemas')

const log = require('logger').child({
  module: 'rabbitmq:publisher'
})

/**
 * Module in charge of rabbitmq connection
 *  client and pubSub are singletons
 */
function RabbitMQ () {}

RabbitMQ.generateTaskDefinitions = function (tasks) {
  return tasks.map(function (task) {
    return {
      name: task,
      jobSchema: require('workers/' + task).jobSchema
    }
  })
}

/**
 * Initiate connection to publisher server
 * must have requires here to remove cyclic deps
 * @returns {Promise}
 * @resolves when connected to rabbit
 * @throws {Error} If Publisher received invalid args
 */
RabbitMQ.prototype.connect = function () {
  log.info('RabbitMQ.connect')
  this._publisher = new Publisher({
    name: process.env.APP_NAME,
    log: log,
    hostname: process.env.RABBITMQ_HOSTNAME,
    port: process.env.RABBITMQ_PORT,
    username: process.env.RABBITMQ_USERNAME,
    password: process.env.RABBITMQ_PASSWORD,
    tasks: RabbitMQ.generateTaskDefinitions([
      'application.container.create',
      'application.container.redeploy',
      'build.container.create',
      'cluster.create',
      'cluster.delete',
      'cluster.update',
      'container.delete',
      'container.resource.clear',
      'context-version.delete',
      'image.push',
      'instance.auto-deploy',
      'instance.delete',
      'instance.kill',
      'instance.rebuild',
      'instance.restart',
      'instance.start',
      'instance.stop',
      'isolation.kill',
      'isolation.match-commit',
      'isolation.redeploy'
    ]),
    events: [{
      name: 'application.container.errored',
      jobSchema: require('workers/application.container.errored').jobSchema
    }, {
      name: 'application.container.created',
      jobSchema: schemas.containerLifeCycleEvent
    }, {
      name: 'application.container.died',
      jobSchema: schemas.containerLifeCycleEvent
    }, {
      name: 'application.container.started',
      jobSchema: schemas.containerLifeCycleEvent
    }, {
      name: 'auto-isolation-config.created',
      jobSchema: schemas.autoIsolationConfigCreated
    }, {
      name: 'build.requested',
      jobSchema: joi.object({
        reasonTriggered: joi.string().required(),
        buildObjectId: joi.string().required()
      }).unknown().required()
    }, {
      name: 'cluster.deleted',
      jobSchema: joi.object({
        cluster: joi.object({
          id: joi.string().required()
        }).unknown().required()
      }).unknown().required()
    }, {
      name: 'build.container.created',
      jobSchema: schemas.containerLifeCycleEvent
    }, {
      name: 'build.container.died',
      jobSchema: schemas.containerLifeCycleEvent
    }, {
      name: 'build.container.started',
      jobSchema: schemas.containerLifeCycleEvent
    }, {
      name: 'instance.updated',
      jobSchema: schemas.instanceChangedSchema
    }, {
      name: 'instance.created',
      jobSchema: schemas.instanceChangedSchema
    }, {
      name: 'instance.deleted',
      jobSchema: schemas.instanceChangedSchema
    }, {
      name: 'instance.deployed',
      jobSchema: joi.object({
        instanceId: joi.string().required(),
        cvId: joi.string().required()
      }).unknown().required()
    }, {
      name: 'instance.started',
      jobSchema: schemas.instanceStarted
    }, {
      name: 'first.dock.created',
      jobSchema: joi.object({
        githubId: joi.number().required(),
        dockerHostIp: joi.string().ip().required()
      }).unknown().required()
    }, {
      name: 'context-version.deleted',
      jobSchema: joi.object({
        contextVersion: joi.object({
          build: joi.object({
            dockerContainer: joi.string().required()
          }).unknown().required(),
          dockerHost: joi.string().uri({ scheme: 'http' }).required()
        }).unknown().required()
      }).unknown().required()
    }, {
      name: 'dock.removed',
      jobSchema: require('workers/dock.removed').jobSchema
    }, {
      name: 'organization.authorized',
      jobSchema: joi.object({
        githubId: joi.number().required(),
        creator: joi.object({
          githubId: joi.number().required(),
          githubUsername: joi.string().required(),
          email: joi.string().required(),
          created: joi.date().iso().required()
        }).unknown().required()
      }).unknown().required()
    }, {
      name: 'terminal.connected',
      jobSchema: schemas.terminalConected
    }, {
      name: 'terminal.data.sent',
      jobSchema: schemas.terminalDataSent
    }, {
      name: 'logstream.connected',
      jobSchema: schemas.logStreamConnected
    }, {
      name: 'user.authorized',
      jobSchema: joi.object({
        githubId: joi.number().required(),
        accessToken: joi.string().required()
      }).unknown().required()
    }, {
      name: 'dock.purged',
      jobSchema: joi.object({
        ipAddress: joi.string().ip().required(),
        githubOrgId: joi.number().required()
      }).unknown().required()
    }]
  })

  return this._publisher.connect()
}

/**
 * disconnect connection to rabbit
 * @returns {Promise}
 * @resolves when disconnected to rabbit
 */
RabbitMQ.prototype.disconnect = function () {
  log.info('RabbitMQ.disconnect')
  return this._publisher.disconnect()
}

RabbitMQ.prototype.startInstanceContainer = function (data) {
  this._publisher.publishTask('instance.start', data)
}

RabbitMQ.prototype.restartInstance = function (data) {
  this._publisher.publishTask('instance.restart', data)
}

RabbitMQ.prototype.createInstanceContainer = function (data) {
  this._publisher.publishTask('application.container.create', data)
}

RabbitMQ.prototype.redeployInstanceContainer = function (data) {
  this._publisher.publishTask('application.container.redeploy', data)
}

RabbitMQ.prototype.stopInstanceContainer = function (data) {
  this._publisher.publishTask('instance.stop', data)
}

RabbitMQ.prototype.deleteInstance = function (data) {
  this._publisher.publishTask('instance.delete', data)
}

RabbitMQ.prototype.deleteContainer = function (data) {
  this._publisher.publishTask('container.delete', data)
}

RabbitMQ.prototype.createImageBuilderContainer = function (data) {
  this._publisher.publishTask('build.container.create', data)
}

RabbitMQ.prototype.publishInstanceRebuild = function (data) {
  this._publisher.publishTask('instance.rebuild', data)
}

RabbitMQ.prototype.instanceUpdated = function (data) {
  this._publisher.publishEvent('instance.updated', cleanEnvKeys(data))
}

RabbitMQ.prototype.instanceCreated = function (data) {
  this._publisher.publishEvent('instance.created', cleanEnvKeys(data))
}

RabbitMQ.prototype.instanceDeleted = function (data) {
  this._publisher.publishEvent('instance.deleted', data)
}

RabbitMQ.prototype.instanceDeployed = function (data) {
  this._publisher.publishEvent('instance.deployed', data)
}

RabbitMQ.prototype.firstDockCreated = function (data) {
  this._publisher.publishEvent('first.dock.created', data)
}

RabbitMQ.prototype.dockPurged = function (data) {
  this._publisher.publishEvent('dock.purged', data)
}

RabbitMQ.prototype.deleteContextVersion = function (data) {
  this._publisher.publishTask('context-version.delete', data)
}

RabbitMQ.prototype.contextVersionDeleted = function (data) {
  this._publisher.publishEvent('context-version.deleted', data)
}

RabbitMQ.prototype.createCluster = function (data) {
  this._publisher.publishTask('cluster.create', data)
}

RabbitMQ.prototype.deleteCluster = function (data) {
  this._publisher.publishTask('cluster.delete', data)
}

RabbitMQ.prototype.updateCluster = function (data) {
  this._publisher.publishTask('cluster.update', data)
}

RabbitMQ.prototype.clusterDeleted = function (data) {
  this._publisher.publishEvent('cluster.deleted', data)
}

RabbitMQ.prototype.publishContainerImageBuilderCreated = function (data) {
  this._publisher.publishEvent('build.container.created', data)
}

RabbitMQ.prototype.publishContainerImageBuilderDied = function (data) {
  this._publisher.publishEvent('build.container.died', data)
}

RabbitMQ.prototype.publishContainerImageBuilderStarted = function (data) {
  this._publisher.publishEvent('build.container.started', data)
}

RabbitMQ.prototype.publishInstanceContainerCreated = function (data) {
  this._publisher.publishEvent('application.container.created', cleanEnvKeys(data))
}

RabbitMQ.prototype.publishInstanceContainerDied = function (data) {
  this._publisher.publishEvent('application.container.died', cleanEnvKeys(data))
}

RabbitMQ.prototype.publishInstanceContainerStarted = function (data) {
  this._publisher.publishEvent('application.container.started', cleanEnvKeys(data))
}

RabbitMQ.prototype.publishDockRemoved = function (data) {
  this._publisher.publishEvent('dock.removed', data)
}

RabbitMQ.prototype.clearContainerMemory = function (data) {
  this._publisher.publishTask('container.resource.clear', data)
}

RabbitMQ.prototype.killInstanceContainer = function (data) {
  this._publisher.publishTask('instance.kill', data)
}

RabbitMQ.prototype.killIsolation = function (data) {
  this._publisher.publishTask('isolation.kill', data)
}

RabbitMQ.prototype.redeployIsolation = function (data) {
  this._publisher.publishTask('isolation.redeploy', data)
}

RabbitMQ.prototype.autoIsolationConfigCreated = function (data) {
  this._publisher.publishEvent('auto-isolation-config.created', data)
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
 */
RabbitMQ.prototype.matchCommitInIsolationInstances = function (data) {
  this._publisher.publishTask('isolation.match-commit', data)
}

RabbitMQ.prototype.publishOrganizationAuthorized = function (data) {
  this._publisher.publishEvent('organization.authorized', data)
}

RabbitMQ.prototype.publishUserAuthorized = function (data) {
  this._publisher.publishEvent('user.authorized', data)
}

RabbitMQ.prototype.instanceContainerErrored = function (data) {
  this._publisher.publishEvent('application.container.errored', data)
}

RabbitMQ.prototype.pushImage = function (data) {
  this._publisher.publishTask('image.push', data)
}

RabbitMQ.prototype.publishInstanceStarted = function (data) {
  this._publisher.publishEvent('instance.started', data)
}

RabbitMQ.prototype.publishBuildRequested = function (data) {
  this._publisher.publishEvent('build.requested', data)
}

RabbitMQ.prototype.autoDeployInstance = function (data) {
  return this._publisher.publishTask('instance.auto-deploy', data)
}

RabbitMQ.prototype.publishTerminalConnected = function (data) {
  return this._publisher.publishEvent('terminal.connected', data)
}

RabbitMQ.prototype.publishTerminalDataSent = function (data) {
  return this._publisher.publishEvent('terminal.data.sent', data)
}

RabbitMQ.prototype.publishLogStreamConnected = function (data) {
  return this._publisher.publishEvent('logstream.connected', data)
}

module.exports = new RabbitMQ()
