/**
 * RabbitMQ publisher
 * @module lib/models/rabbitmq/index
 */
'use strict'
require('loadenv')()
const joi = require('joi')
const Publisher = require('ponos/lib/rabbitmq')

const log = require('logger').child({
  module: 'rabbitmq:publisher'
})

/**
 * Module in charge of rabbitmq connection
 *  client and pubSub are singletons
 */
class RabbitMQ extends Publisher {

  constructor () {
    super({
      name: process.env.APP_NAME,
      log: log,
      hostname: process.env.RABBITMQ_HOSTNAME,
      port: process.env.RABBITMQ_PORT,
      username: process.env.RABBITMQ_USERNAME,
      password: process.env.RABBITMQ_PASSWORD,
      tasks: RabbitMQ.generateTaskDefinitions([
        'container.image-builder.create',
        'container.resource.clear',
        'context-version.delete',
        'image.push',
        'instance.container.create',
        'instance.container.delete',
        'instance.container.redeploy',
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
        name: 'container.image-builder.created',
        jobSchema: require('workers/container.image-builder.created').jobSchema
      }, {
        name: 'instance.container.created',
        jobSchema: require('workers/instance.container.created').jobSchema
      }, {
        name: 'container.image-builder.died',
        jobSchema: require('workers/container.image-builder.died').jobSchema
      }, {
        name: 'instance.container.died',
        jobSchema: require('workers/instance.container.died').jobSchema
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
      }, {
        name: 'instance.created',
        jobSchema: joi.object({
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
      }, {
        name: 'instance.deleted',
        jobSchema: joi.object({
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
      }, {
        name: 'instance.deployed',
        jobSchema: joi.object({
          instanceId: joi.string().required(),
          cvId: joi.string().required()
        }).unknown().required()
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
        name: 'container.image-builder.started',
        jobSchema: require('workers/container.image-builder.started').jobSchema
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
        name: 'instance.container.errored',
        jobSchema: require('workers/instance.container.errored').jobSchema
      }, {
        name: 'dock.purged',
        jobSchema: joi.object({
          ipAddress: joi.string().ip().required(),
          githubOrgId: joi.string().required()
        }).unknown().required()
      }]
    })
  }

  static generateTaskDefinitions (tasks) {
    return tasks.map(function (task) {
      return {
        name: task,
        jobSchema: require('workers/' + task).jobSchema
      }
    })
  }

  startInstanceContainer (data) {
    this.publishTask('instance.start', data)
  }

  restartInstance (data) {
    this.publishTask('instance.restart', data)
  }

  createInstanceContainer (data) {
    this.publishTask('instance.container.create', data)
  }

  redeployInstanceContainer (data) {
    this.publishTask('instance.container.redeploy', data)
  }

  stopInstanceContainer (data) {
    this.publishTask('instance.stop', data)
  }

  deleteInstance (data) {
    this.publishTask('instance.delete', data)
  }

  deleteInstanceContainer (data) {
    this.publishTask('instance.container.delete', data)
  }

  createImageBuilderContainer (data) {
    this.publishTask('container.image-builder.create', data)
  }

  publishInstanceRebuild (data) {
    this.publishTask('instance.rebuild', data)
  }

  instanceUpdated (data) {
    this.publishEvent('instance.updated', data)
  }

  instanceCreated (data) {
    this.publishEvent('instance.created', data)
  }

  instanceDeleted (data) {
    this.publishEvent('instance.deleted', data)
  }

  instanceDeployed (data) {
    this.publishEvent('instance.deployed', data)
  }

  firstDockCreated (data) {
    this.publishEvent('first.dock.created', data)
  }

  dockPurged (data) {
    this.publishEvent('dock.purged', data)
  }

  deleteContextVersion (data) {
    this.publishTask('context-version.delete', data)
  }

  contextVersionDeleted (data) {
    this.publishEvent('context-version.deleted', data)
  }

  publishContainerImageBuilderStarted (data) {
    this.publishEvent('container.image-builder.started', data)
  }

  publishInstanceContainerCreated (data) {
    this.publishEvent('instance.container.created', data)
  }

  publishContainerImageBuilderCreated (data) {
    this.publishEvent('container.image-builder.created', data)
  }

  publishInstanceContainerDied (data) {
    this.publishEvent('instance.container.died', data)
  }

  publishContainerImageBuilderDied (data) {
    this.publishEvent('container.image-builder.died', data)
  }

  publishDockRemoved (data) {
    this.publishEvent('dock.removed', data)
  }

  clearContainerMemory (data) {
    this.publishTask('container.resource.clear', data)
  }

  killInstanceContainer (data) {
    this.publishTask('instance.kill', data)
  }

  killIsolation (data) {
    this.publishTask('isolation.kill', data)
  }

  redeployIsolation (data) {
    this.publishTask('isolation.redeploy', data)
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
  matchCommitInIsolationInstances (data) {
    this.publishTask('isolation.match-commit', data)
  }

  publishOrganizationAuthorized (data) {
    this.publishEvent('organization.authorized', data)
  }

  publishUserAuthorized (data) {
    this.publishEvent('user.authorized', data)
  }

  instanceContainerErrored (data) {
    this.publishEvent('instance.container.errored', data)
  }

  pushImage (data) {
    this.publishTask('image.push', data)
  }
}

module.exports = new RabbitMQ()
