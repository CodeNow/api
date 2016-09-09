/**
 * RabbitMQ job management
 * @module lib/models/rabbitmq/index
 */
'use strict'
require('loadenv')()
var joi = require('joi')
var keypather = require('keypather')()
var Publisher = require('ponos/lib/rabbitmq')

var logger = require('middlewares/logger')(__filename)
var log = logger.log

/**
 * Module in charge of rabbitmq connection
 *  client and pubSub are singletons
 */
function RabbitMQ () {}

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
    hostname: process.env.RABBITMQ_HOSTNAME,
    port: process.env.RABBITMQ_PORT,
    username: process.env.RABBITMQ_USERNAME,
    password: process.env.RABBITMQ_PASSWORD,
    tasks: [{
      name: 'instance.start',
      jobSchema: require('workers/instance.start').jobSchema
    }, {
      name: 'instance.restart',
      jobSchema: require('workers/instance.restart').jobSchema
    }, {
      name: 'instance.container.create',
      jobSchema: require('workers/instance.container.create').jobSchema
    }, {
      name: 'instance.container.redeploy',
      jobSchema: require('workers/instance.container.redeploy').jobSchema
    }, {
      name: 'instance.stop',
      jobSchema: require('workers/instance.stop').jobSchema
    }, {
      name: 'instance.delete',
      jobSchema: require('workers/instance.delete').jobSchema
    }, {
      name: 'instance.container.delete',
      jobSchema: require('workers/instance.container.delete').jobSchema
    }, {
      name: 'container.image-builder.create',
      jobSchema: require('workers/container.image-builder.create').jobSchema
    }, {
      name: 'instance.rebuild',
      jobSchema: require('workers/instance.rebuild').jobSchema
    }, {
      name: 'context-version.delete',
      jobSchema: require('workers/context-version.delete').jobSchema
    }, {
      name: 'container.resource.clear',
      jobSchema: require('workers/container.resource.clear').jobSchema
    }, {
      name: 'instance.kill',
      jobSchema: require('workers/instance.kill').jobSchema
    }, {
      name: 'isolation.kill',
      jobSchema: require('workers/isolation.kill').jobSchema
    }, {
      name: 'isolation.redeploy',
      jobSchema: require('workers/isolation.redeploy').jobSchema
    }, {
      name: 'isolation.match-commit',
      jobSchema: require('workers/isolation.match-commit').jobSchema
    }],
    events: [{
      name: 'container.image-builder.created',
      jobSchema: require('workers/container.image-builder.created').jobSchema
    }, {
      name: 'instance.container.created',
      jobSchema: require('workers/instance.container.created').jobSchema
    }, {
      name: 'user.whitelisted',
      jobSchema: joi.object({
        orgName: joi.string().required(),
        githubId: joi.number().required(),
        createdAt: joi.date().timestamp('unix').required()
      }).unknown().required()
    }, {
      name: 'instance.updated',
      jobSchema: joi.object({
        timestamp: joi.date().timestamp('unix').required(),
        instance: joi.object({
          owner: joi.object({
            github: joi.number().required()
          }).unknown().required(),
          contextVersions: joi.array().items(
            joi.object({
              appCodeVersions: joi.array().items(
                joi.object({
                  repo: joi.string().required(),
                  branch: joi.string().required()
                }).unknown().label('app code version')
              ).required()
            }).unknown().label('context version')
          ).required()
        }).unknown().required()
      }).unknown().required()
    }, {
      name: 'instance.created',
      jobSchema: joi.object({
        timestamp: joi.date().timestamp('unix').required(),
        instance: joi.object({
          owner: joi.object({
            github: joi.number().required()
          }).unknown().required(),
          contextVersions: joi.array().items(
            joi.object({
              appCodeVersions: joi.array().items(
                joi.object({
                  repo: joi.string().required(),
                  branch: joi.string().required()
                }).unknown().label('app code version')
              ).required()
            }).unknown().label('context version')
          ).required()
        }).unknown().required()
      }).unknown().required()
    }, {
      name: 'instance.deleted',
      jobSchema: joi.object({
        timestamp: joi.date().timestamp('unix').required(),
        instance: joi.object({
          owner: joi.object({
            github: joi.number().required()
          }).unknown().required(),
          contextVersions: joi.array().items(
            joi.object({
              appCodeVersions: joi.array().items(
                joi.object({
                  repo: joi.string().required(),
                  branch: joi.string().required()
                }).unknown().label('app code version')
              ).required()
            }).unknown().label('context version')
          ).required()
        }).unknown().required()
      }).unknown().required()
    }, {
      name: 'instance.deployed',
      jobSchema: joi.object({
        instanceId: joi.string().required(),
        cvId: joi.string().required()
      }).unknown().required()
    }, {
      name: 'first.dock.created',
      jobSchema: joi.object({
        githubId: joi.number().required()
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
      name: 'container.image-builder.started',
      jobSchema: joi.object({
        inspectData: joi.object({
          Config: joi.object({
            Labels: joi.object({
              'contextVersion.build._id': joi.string().required()
            }).unknown().required()
          }).unknown().required()
        }).unknown().required()
      }).unknown().required()
    }, {
      name: 'dock.removed',
      jobSchema: joi.object({
        host: joi.string().uri({ scheme: 'http' }).required()
      }).unknown().required()
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
      name: 'instance.container.errored',
      jobSchema: joi.object({
        host: joi.string().uri({ scheme: 'http' }).required()
      }).unknown().required()
    }, {
      name: 'dock.purged',
      jobSchema: joi.object({
        ipAddress: joi.string().ip()
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
  log.info('RabbitMQ.connect')
  return this._publisher.disconnect()
}

/**
 * create a start-instance-container job and insert it into queue
 * @param {Object} data
 */
RabbitMQ.prototype.startInstanceContainer = function (data) {
  log.info({
    data: data
  }, 'RabbitMQ.startInstanceContainer')
  this._publisher.publishTask('instance.start', data)
}

/**
 * create a instance.restart job and insert it into queue
 * @param {Object} data
 */
RabbitMQ.prototype.restartInstance = function (data) {
  log.info({
    data: data
  }, 'RabbitMQ.startInstanceContainer')
  this._publisher.publishTask('instance.restart', data)
}

/**
 * create a instance.container.create job and insert it into queue
 * @param {Object} data
 */
RabbitMQ.prototype.createInstanceContainer = function (data) {
  log.info({
    data: data
  }, 'RabbitMQ.createInstanceContainer')
  this._publisher.publishTask('instance.container.create', data)
}

/**
 * create a instance.container.redeploy job and insert it into queue
 * @param {Object} data
 */
RabbitMQ.prototype.redeployInstanceContainer = function (data) {
  log.info({
    data: data
  }, 'RabbitMQ.redeployInstanceContainer')
  this._publisher.publishTask('instance.container.redeploy', data)
}

/**
 * create a instance.stop job and insert it into queue
 * @param {Object} data
 */
RabbitMQ.prototype.stopInstanceContainer = function (data) {
  log.info({
    data: data
  }, 'RabbitMQ.stopInstanceContainer')
  this._publisher.publishTask('instance.stop', data)
}

/**
 * create a instance.delete job and insert it into queue
 * @param {Object} data
 */
RabbitMQ.prototype.deleteInstance = function (data) {
  log.info({
    instance: keypather.get(data, 'instance'),
    sessionUserId: keypather.get(data, 'sessionUserId')
  }, 'RabbitMQ.deleteInstance')
  this._publisher.publishTask('instance.delete', data)
}

/**
 * create a instance.container.delete job and insert it into queue
 * NOTE: instanceMasterBranch can be null because non-repo containers have no branches
 * NOTE: isolated and isIsolationGroupMaster can be null
 * @param {Object} data
 */
RabbitMQ.prototype.deleteInstanceContainer = function (data) {
  log.info({
    data: data
  }, 'RabbitMQ.deleteInstanceContainer')
  this._publisher.publishTask('instance.container.delete', data)
}

/**
 * create a `container.image-builder.create` job and insert it into queue
 * @param {Object} data
 */
RabbitMQ.prototype.createImageBuilderContainer = function (data) {
  log.info({
    data: data
  }, 'RabbitMQ.createImageBuilderContainer')
  this._publisher.publishTask('container.image-builder.create', data)
}

/**
 * create an instance.rebuild job
 * @param {Object} data
 */
RabbitMQ.prototype.publishInstanceRebuild = function (data) {
  log.info({
    data: data
  }, 'RabbitMQ.publishInstanceRebuild')
  this._publisher.publishTask('instance.rebuild', data)
}

/**
 * create a instance-updated job and insert it into queue
 * @param {Object} data
 */
RabbitMQ.prototype.instanceUpdated = function (data) {
  log.info({
    instance: keypather.get(data, 'instance')
  }, 'RabbitMQ.instanceUpdated')
  this._publisher.publishEvent('instance.updated', data)
}

/**
 * create a instance-updated job and insert it into queue
 * @param {Object} data
 */
RabbitMQ.prototype.instanceCreated = function (data) {
  log.info({
    instance: keypather.get(data, 'instance')
  }, 'RabbitMQ.instanceCreated')
  this._publisher.publishEvent('instance.created', data)
}

/**
 * create a instance-deleted job and insert it into queue
 * @param {Object} data
 */
RabbitMQ.prototype.instanceDeleted = function (data) {
  log.info({
    instance: keypather.get(data, 'instance')
  }, 'RabbitMQ.instanceDeleted')
  this._publisher.publishEvent('instance.deleted', data)
}

/**
 * create a instance.deployed job and insert it into queue
 * @param {Object} data
 */
RabbitMQ.prototype.instanceDeployed = function (data) {
  log.info({
    data: data
  }, 'RabbitMQ.instanceDeployed')
  this._publisher.publishEvent('instance.deployed', data)
}

/**
 * create a first.dock.created job and insert it into queue
 * @param {Object} data
 */
RabbitMQ.prototype.firstDockCreated = function (data) {
  log.info({
    data: data
  }, 'RabbitMQ.instanceUpdated')
  this._publisher.publishEvent('first.dock.created', data)
}

/**
 * publish dock.purged event
 * @param {Object} data
 */
RabbitMQ.prototype.dockPurged = function (data) {
  log.info({
    ipAddress: data.ipAddress
  }, 'RabbitMQ.dockPurged')
  this._publisher.publishEvent('dock.purged', data)
}

/**
 * Delete a context version
 * @param {Object} data
 * @param {Object} data.contextVersion - Context Version object
 */
RabbitMQ.prototype.deleteContextVersion = function (data) {
  log.info({
    contextVersionId: keypather.get(data, 'contextVersionId')
  }, 'RabbitMQ.deleteContextVersion')
  this._publisher.publishTask('context-version.delete', data)
}

/**
 * Context version deleted event
 * @param {Object} data
 * @param {Object} data.contextVersion - Context Version object
 */
RabbitMQ.prototype.contextVersionDeleted = function (data) {
  log.info({
    contextVersion: keypather.get(data, 'contextVersion')
  }, 'RabbitMQ.contextVersionDeleted')
  this._publisher.publishEvent('context-version.deleted', data)
}

/**
 * create container.image-builder.started job
 * @param {Object} data job data
 */
RabbitMQ.prototype.publishContainerImageBuilderStarted = function (data) {
  log.info({
    job: data
  }, 'RabbitMQ.publishContainerImageBuilderStarted')
  this._publisher.publishEvent('container.image-builder.started', data)
}

/**
 * create instance.container.created job
 * @param {Object} data job data
 */
RabbitMQ.prototype.publishInstanceContainerCreated = function (data) {
  log.info({
    job: data
  }, 'RabbitMQ.publishInstanceContainerCreated')
  this._publisher.publishEvent('instance.container.created', data)
}

/**
 * create instance.container.created job
 * @param {Object} data job data
 */
RabbitMQ.prototype.publishContainerImageBuilderCreated = function (data) {
  log.info({
    job: data
  }, 'RabbitMQ.publishContainerImageBuilderCreated')
  this._publisher.publishEvent('container.image-builder.created', data)
}

/**
 * create dock.removed job
 * @param {Object} data job data
 */
RabbitMQ.prototype.publishDockRemoved = function (data) {
  log.info({
    job: data
  }, 'RabbitMQ.publishDockRemoved')
  this._publisher.publishEvent('dock.removed', data)
}

/**
 * create container.resource.clear job
 * @param {Object} data job data
 */
RabbitMQ.prototype.clearContainerMemory = function (data) {
  log.info({
    job: data
  }, 'RabbitMQ.clearContainerMemory')
  this._publisher.publishTask('container.resource.clear', data)
}

/**
 * Create a instance.kill job and insert it in the queue
 * @param {Object} data
 */
RabbitMQ.prototype.killInstanceContainer = function (data) {
  log.info({
    data: data
  }, 'RabbitMQ.killInstanceContainer')
  this._publisher.publishTask('instance.kill', data)
}

/**
 * Create a isolation.kill job and insert it in the queue
 * @param {Object} data
 */
RabbitMQ.prototype.killIsolation = function (data) {
  log.info({
    data: data
  }, 'RabbitMQ.killIsolation')
  this._publisher.publishTask('isolation.kill', data)
}

/**
 * Create a isolation.redeploy job and insert it in the queue
 * @param {Object} data
 */
RabbitMQ.prototype.redeployIsolation = function (data) {
  log.info({
    data: data
  }, 'RabbitMQ.redeployIsolation')
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
 * @param {ObjectId}  data.isolationId         - Isolation ID
 * @param {ObjectId}  data.instancedId         - Instance ID
 * @param {Number}    data.sessionUserGithubId - Session user GithubId
 */
RabbitMQ.prototype.matchCommitInIsolationInstances = function (data) {
  log.info({
    data: data
  }, 'RabbitMQ.matchCommitWithIsolationMaster')
  this._publisher.publishTask('isolation.match-commit', data)
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
RabbitMQ.prototype.publishOrganizationAuthorized = function (data) {
  log.info({
    data: data
  }, 'RabbitMQ.publishOrganizationAuthorized')
  this._publisher.publishEvent('organization.authorized', data)
}

/**
 * Creates a Runnable user
 *
 * @param {Object} data
 * @param {Number} data.githubId - Github ID for Github User
 */
RabbitMQ.prototype.publishUserAuthorized = function (data) {
  log.info({
    data: data
  }, 'RabbitMQ.publishUserAuthorized')
  this._publisher.publishEvent('user.authorized', data)
}

/**
 * Creates a `instance.container.errored` job.
 * @param {Object} data
 * @param {String} data.instanceId  - instance to which container belongs
 * @param {String} data.containerId - Container id to delete
 * @param {String} data.error       - Container error that happened
 */
RabbitMQ.prototype.instanceContainerErrored = function (data) {
  log.info({
    data: data
  }, 'RabbitMQ.instanceContainerErrored')
  this._publisher.publishEvent('instance.container.errored', data)
}

module.exports = new RabbitMQ()
