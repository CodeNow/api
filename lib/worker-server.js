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
      'instance.container.create': require('workers/instance.container.create'),
      'instance.container.delete': require('workers/instance.container.delete'),
      'instance.container.redeploy': require('workers/instance.container.redeploy'),
      'instance.delete': require('workers/instance.delete'),
      'instance.kill': require('workers/instance.kill'),
      'instance.rebuild': require('workers/instance.rebuild'),
      'instance.restart': require('workers/instance.restart'),
      'instance.start': require('workers/instance.start'),
      'instance.stop': require('workers/instance.stop'),
      'isolation.kill': require('workers/isolation.kill'),
      'isolation.match-commit': require('workers/isolation.match-commit'),
      'isolation.redeploy': require('workers/isolation.redeploy')
    },
    events: {
      'container.image-builder.created': require('workers/container.image-builder.created'),
      'container.image-builder.died': require('workers/container.image-builder.died'),
      'container.image-builder.started': require('workers/container.image-builder.started'),
      'container.life-cycle.created': require('workers/container.life-cycle.created'),
      'container.life-cycle.died': require('workers/container.life-cycle.died'),
      'container.life-cycle.started': require('workers/container.life-cycle.started'),
      'container.network.attached': require('workers/container.network.attached'),
      'container.state.polled': require('workers/container.state.polled'),
      'dock.removed': require('workers/dock.removed'),
      'docker.events-stream.connected': require('workers/docker.events-stream.connected'),
      'docker.events-stream.disconnected': require('workers/docker.events-stream.disconnected'),
      'instance.container.created': require('workers/instance.container.created'),
      'instance.container.died': require('workers/instance.container.died'),
      'instance.container.errored': require('workers/instance.container.errored'),
      'instance.expired': require('workers/instance.delete')
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
