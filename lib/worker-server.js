'use strict'
require('loadenv')()

const ponos = require('ponos')

const log = require('logger').child({
  module: 'WorkerServer'
})

/**
 * The api ponos server.
 * @type {ponos~Server}
 * @module api/worker-server
 */
module.exports = new ponos.Server({
  name: process.env.APP_NAME,
  enableErrorEvents: true,
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
    'build.container.create': require('workers/build.container.create'),
    'container.resource.clear': require('workers/container.resource.clear'),
    'context-version.delete': require('workers/context-version.delete'),
    'image.push': require('workers/image.push'),
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
    'application.container.created': require('workers/application.container.created'),
    'application.container.died': require('workers/application.container.died'),
    'application.container.errored': require('workers/application.container.errored'),
    'build.container.created': require('workers/build.container.created'),
    'build.container.died': require('workers/build.container.died'),
    'build.container.started': require('workers/build.container.started'),
    'container.life-cycle.created': require('workers/container.life-cycle.created'),
    'container.life-cycle.died': require('workers/container.life-cycle.died'),
    'container.life-cycle.started': require('workers/container.life-cycle.started'),
    'container.network.attached': require('workers/container.network.attached'),
    'container.state.polled': require('workers/container.state.polled'),
    'dock.removed': require('workers/dock.removed'),
    'docker.events-stream.connected': require('workers/docker.events-stream.connected'),
    'docker.events-stream.disconnected': require('workers/docker.events-stream.disconnected'),
    'instance.expired': require('workers/instance.delete'),
    'instance.started': require('workers/instance.started')
  },
  redisRateLimiter: {
    host: process.env.REDIS_IPADDRESS,
    port: process.env.REDIS_PORT
  }
})
