/**
 * RabbitMQ publisher
 * @module lib/models/rabbitmq/index
 */
'use strict'
require('loadenv')()
const joi = require('joi')
const Publisher = require('ponos/lib/rabbitmq')

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

const instanceChanedSchema = joi.object({
  timestamp: joi.date().timestamp('unix').required(),
  instance: joi.object({
    owner: joi.object({
      github: joi.number().required()
    }).unknown().required(),
    contextVersion: joi.object({
      appCodeVersions: joi.array().items(
        joi.object({
          repo: joi.string().required(),
          branch: joi.string().required()
        }).unknown().label('app code version')
      ).required()
    }).unknown().required().label('context version')
  }).unknown().required()
}).unknown().required()

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
      'application.container.delete',
      'application.container.redeploy',
      'build.container.create',
      'container.resource.clear',
      'context-version.delete',
      'image.push',
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
      name: 'build.requested',
      jobSchema: joi.object({
        reasonTriggered: joi.string().required(),
        buildObjectId: joi.string().required()
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
      name: 'user.whitelisted',
      jobSchema: joi.object({
        orgName: joi.string().required(),
        githubId: joi.number().required(),
        createdAt: joi.date().timestamp('unix').required()
      }).unknown().required()
    }, {
      name: 'instance.updated',
      jobSchema: instanceChanedSchema
    }, {
      name: 'instance.created',
      jobSchema: instanceChanedSchema
    }, {
      name: 'instance.deleted',
      jobSchema: instanceChanedSchema
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

/**
 * create a instance.start job and insert it into queue
 * @param {Object} data
 */
RabbitMQ.prototype.startInstanceContainer = function (data) {
  this._publisher.publishTask('instance.start', data)
}

/**
 * create a instance.restart job and insert it into queue
 * @param {Object} data
 */
RabbitMQ.prototype.restartInstance = function (data) {
  this._publisher.publishTask('instance.restart', data)
}

/**
 * create a application.container.create job and insert it into queue
 * @param {Object} data
 */
RabbitMQ.prototype.createInstanceContainer = function (data) {
  this._publisher.publishTask('application.container.create', data)
}

/**
 * create a application.container.redeploy job and insert it into queue
 * @param {Object} data
 */
RabbitMQ.prototype.redeployInstanceContainer = function (data) {
  this._publisher.publishTask('application.container.redeploy', data)
}

/**
 * create a instance.stop job and insert it into queue
 * @param {Object} data
 */
RabbitMQ.prototype.stopInstanceContainer = function (data) {
  this._publisher.publishTask('instance.stop', data)
}

/**
 * create a instance.delete job and insert it into queue
 * @param {Object} data
 */
RabbitMQ.prototype.deleteInstance = function (data) {
  this._publisher.publishTask('instance.delete', data)
}

/**
 * create a application.container.delete job and insert it into queue
 * NOTE: instanceMasterBranch can be null because non-repo containers have no branches
 * NOTE: isolated and isIsolationGroupMaster can be null
 * @param {Object} data
 */
RabbitMQ.prototype.deleteInstanceContainer = function (data) {
  this._publisher.publishTask('application.container.delete', data)
}

/**
 * create a `build.container.create` job and insert it into queue
 * @param {Object} data
 */
RabbitMQ.prototype.createImageBuilderContainer = function (data) {
  this._publisher.publishTask('build.container.create', data)
}

/**
 * create an instance.rebuild job
 * @param {Object} data
 */
RabbitMQ.prototype.publishInstanceRebuild = function (data) {
  this._publisher.publishTask('instance.rebuild', data)
}

/**
 * create a instance-updated job and insert it into queue
 * @param {Object} data
 */
RabbitMQ.prototype.instanceUpdated = function (data) {
  this._publisher.publishEvent('instance.updated', data)
}

/**
 * create a instance-updated job and insert it into queue
 * @param {Object} data
 */
RabbitMQ.prototype.instanceCreated = function (data) {
  this._publisher.publishEvent('instance.created', data)
}

/**
 * create a instance-deleted job and insert it into queue
 * @param {Object} data
 */
RabbitMQ.prototype.instanceDeleted = function (data) {
  this._publisher.publishEvent('instance.deleted', data)
}

/**
 * create a instance.deployed job and insert it into queue
 * @param {Object} data
 */
RabbitMQ.prototype.instanceDeployed = function (data) {
  this._publisher.publishEvent('instance.deployed', data)
}

/**
 * create a first.dock.created job and insert it into queue
 * @param {Object} data
 */
RabbitMQ.prototype.firstDockCreated = function (data) {
  this._publisher.publishEvent('first.dock.created', data)
}

/**
 * publish dock.purged event
 * @param {Object} data
 */
RabbitMQ.prototype.dockPurged = function (data) {
  this._publisher.publishEvent('dock.purged', data)
}

/**
 * Delete a context version
 * @param {Object} data
 * @param {Object} data.contextVersion - Context Version object
 */
RabbitMQ.prototype.deleteContextVersion = function (data) {
  this._publisher.publishTask('context-version.delete', data)
}

/**
 * Context version deleted event
 * @param {Object} data
 * @param {Object} data.contextVersion - Context Version object
 */
RabbitMQ.prototype.contextVersionDeleted = function (data) {
  this._publisher.publishEvent('context-version.deleted', data)
}

/**
 * create build.container.created job
 * @param {Object} data job data
 */
RabbitMQ.prototype.publishContainerImageBuilderCreated = function (data) {
  this._publisher.publishEvent('build.container.created', data)
}

/**
 * create build.container.died job
 * @param {Object} data job data
 */
RabbitMQ.prototype.publishContainerImageBuilderDied = function (data) {
  this._publisher.publishEvent('build.container.died', data)
}

/**
 * create build.container.started job
 * @param {Object} data job data
 */
RabbitMQ.prototype.publishContainerImageBuilderStarted = function (data) {
  this._publisher.publishEvent('build.container.started', data)
}

/**
 * create application.container.created job
 * @param {Object} data job data
 */
RabbitMQ.prototype.publishInstanceContainerCreated = function (data) {
  this._publisher.publishEvent('application.container.created', data)
}

/**
 * create application.container.died job
 * @param {Object} data job data
 */
RabbitMQ.prototype.publishInstanceContainerDied = function (data) {
  this._publisher.publishEvent('application.container.died', data)
}

/**
 * create application.container.died job
 * @param {Object} data job data
 */
RabbitMQ.prototype.publishInstanceContainerStarted = function (data) {
  this._publisher.publishEvent('application.container.started', data)
}

/**
 * create dock.removed job
 * @param {Object} data job data
 */
RabbitMQ.prototype.publishDockRemoved = function (data) {
  this._publisher.publishEvent('dock.removed', data)
}

/**
 * create container.resource.clear job
 * @param {Object} data job data
 */
RabbitMQ.prototype.clearContainerMemory = function (data) {
  this._publisher.publishTask('container.resource.clear', data)
}

/**
 * Create a instance.kill job and insert it in the queue
 * @param {Object} data
 */
RabbitMQ.prototype.killInstanceContainer = function (data) {
  this._publisher.publishTask('instance.kill', data)
}

/**
 * Create a isolation.kill job and insert it in the queue
 * @param {Object} data
 */
RabbitMQ.prototype.killIsolation = function (data) {
  this._publisher.publishTask('isolation.kill', data)
}

/**
 * Create a isolation.redeploy job and insert it in the queue
 * @param {Object} data
 */
RabbitMQ.prototype.redeployIsolation = function (data) {
  this._publisher.publishTask('isolation.redeploy', data)
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

/**
 * Creates an organization and spins up a dock for that org
 *
 * @param {Object} data
 */
RabbitMQ.prototype.publishOrganizationAuthorized = function (data) {
  this._publisher.publishEvent('organization.authorized', data)
}

/**
 * Creates a Runnable user
 *
 * @param {Object} data
 */
RabbitMQ.prototype.publishUserAuthorized = function (data) {
  this._publisher.publishEvent('user.authorized', data)
}

/**
 * Creates a `application.container.errored` job.
 * @param {Object} data
 */
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

module.exports = new RabbitMQ()
