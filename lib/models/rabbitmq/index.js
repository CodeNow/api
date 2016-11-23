/**
 * RabbitMQ publisher
 * @module lib/models/rabbitmq/index
 */
'use strict'
require('loadenv')()
const joi = require('joi')
const RabbitMQ = require('ponos/lib/rabbitmq')

const schemas = require('models/rabbitmq/schemas')
const logger = require('logger')

function generateTaskDefinitions (tasks) {
  return tasks.map(function (task) {
    return {
      name: task,
      jobSchema: require('workers/' + task).jobSchema
    }
  })
}

const instanceChangedSchema = joi.object({
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
 * Module in charge of rabbitmq connection
 */
class Publisher extends RabbitMQ {
  constructor () {
    const log = logger.child({ module: 'rabbitmq:publisher' })
    super({
      name: process.env.APP_NAME,
      log: log,
      tasks: generateTaskDefinitions([
        'application.container.create',
        'application.container.redeploy',
        'build.container.create',
        'container.delete',
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
        name: 'instance.updated',
        jobSchema: instanceChangedSchema
      }, {
        name: 'instance.created',
        jobSchema: instanceChangedSchema
      }, {
        name: 'instance.deleted',
        jobSchema: instanceChangedSchema
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
  }

   startInstanceContainer (data) {
     this.publishTask('instance.start', data)
   }

   restartInstance (data) {
     this.publishTask('instance.restart', data)
   }

   createInstanceContainer (data) {
     this.publishTask('application.container.create', data)
   }

   redeployInstanceContainer (data) {
     this.publishTask('application.container.redeploy', data)
   }

   stopInstanceContainer (data) {
     this.publishTask('instance.stop', data)
   }

   deleteInstance (data) {
     this.publishTask('instance.delete', data)
   }

   deleteContainer (data) {
     this.publishTask('container.delete', data)
   }

   createImageBuilderContainer (data) {
     this.publishTask('build.container.create', data)
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

   publishContainerImageBuilderCreated (data) {
     this.publishEvent('build.container.created', data)
   }

   publishContainerImageBuilderDied (data) {
     this.publishEvent('build.container.died', data)
   }

   publishContainerImageBuilderStarted (data) {
     this.publishEvent('build.container.started', data)
   }

   publishInstanceContainerCreated (data) {
     this.publishEvent('application.container.created', data)
   }

   publishInstanceContainerDied (data) {
     this.publishEvent('application.container.died', data)
   }

   publishInstanceContainerStarted (data) {
     this.publishEvent('application.container.started', data)
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
     this.publishEvent('application.container.errored', data)
   }

   pushImage (data) {
     this.publishTask('image.push', data)
   }

   publishInstanceStarted (data) {
     this.publishEvent('instance.started', data)
   }

   publishBuildRequested (data) {
     this.publishEvent('build.requested', data)
   }
}

module.exports = new Publisher()
