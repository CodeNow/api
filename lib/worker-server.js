'use strict'
require('loadenv')()

var ponos = require('ponos')

var log = require('middlewares/logger')(__filename).log

module.exports = WorkerServer

/**
 * Module used to listen for and handle runnable events
 */
function WorkerServer () { }

/**
 * ponos worker server
 * @type {Object}
 */
WorkerServer._server = null

/**
 * setup ponos server with tasks
 * @returns {Promise}
 * @resolves {null} if worker started
 * @rejects {Error} if error starting
 */
WorkerServer.listen = function () {
  log.info('WorkerServer listen')

  WorkerServer._server = new ponos.Server({
    name: process.env.APP_NAME,
    log: log,
    rabbitmq: {
      channel: {
        prefetch: process.env.WORKER_PREFETCH
      },
      hostname: process.env.RABBITMQ_HOSTNAME,
      port: process.env.RABBITMQ_PORT,
      username: process.env.RABBITMQ_USERNAME,
      password: process.env.RABBITMQ_PASSWORD
    },
    tasks: {
      'container.image-builder.create': require('workers/container.image-builder.create'),
      'container.resource.clear': require('workers/container.resource.clear'),
      'context-version.delete': require('workers/context-version.delete'),
      'create-instance-container': require('workers/instance.container.create'),
      'instance.container.delete': require('workers/instance.container.delete'),
      'instance.container.redeploy': require('workers/instance.container.redeploy'),
      'instance.delete': require('workers/instance.delete'),
      'instance.kill': require('workers/instance.kill'),
      'instance.rebuild': require('workers/instance.rebuild'),
      'instance.restart': require('workers/instance.restart'),
      'isolation.kill': require('workers/isolation.kill'),
      'isolation.match-commit': require('workers/isolation.match-commit'),
      'isolation.redeploy': require('workers/isolation.redeploy'),
      'on-image-builder-container-create': require('workers/container.image-builder.created'),
      'on-image-builder-container-die': require('workers/container.image-builder.died'),
      'on-instance-container-create': require('workers/instance.container.created'),
      'on-instance-container-die': require('workers/instance.container.died'),
      'start-instance-container': require('workers/instance.start'),
      'stop-instance-container': require('workers/instance.stop')
    },
    events: {
      'container.image-builder.started': require('workers/container.image-builder.started'),
      'container.life-cycle.started': require('workers/container.life-cycle.started'),
      'container.network.attached': require('workers/container.network.attached'),
      'container.state.polled': require('workers/container.state.polled'),
      'dock.removed': require('workers/dock.removed'),
      'docker.events-stream.connected': require('workers/docker.events-stream.connected'),
      'docker.events-stream.disconnected': require('workers/docker.events-stream.disconnected'),
      'instance.container.errored': require('workers/instance.container.errored')
    }
  })

  return WorkerServer._server
    .start()
    .then(function () {
      log.trace('worker server started')
    })
    .catch(function (err) {
      log.error({ err: err }, 'worker server failed to started')
      throw err
    })
}

/**
 * closes the server
 * @returns {Promise}
 * @resolves {null} if worker started
 * @rejects {Error} if error starting
 */
WorkerServer.stop = function () {
  log.info('stop')

  return WorkerServer._server
    .stop()
    .then(function () {
      log.trace('worker server stopped')
    })
    .catch(function (err) {
      log.error({ err: err }, 'worker server failed to stop')
      throw err
    })
}
