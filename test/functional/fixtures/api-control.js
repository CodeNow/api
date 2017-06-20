'use strict'

var authMiddlewares = require('middlewares/auth')
var sinon = require('sinon')
if (!authMiddlewares.requireWhitelist.isSinonProxy) {
  // Duck it, we never need to restore this stub anyways right?
  sinon.stub(authMiddlewares, 'requireWhitelist').callsArg(2)
}
var async = require('async')
var Publisher = require('ponos/lib/rabbitmq')

var api = require('../../../app')
var cleanMongo = require('./clean-mongo')
var rabbitMQ = require('models/rabbitmq')

module.exports = {
  start: startApi,
  stop: stopApi
}

// we need to setup this before starting api.
// this create exchanges that is used by api
var publishedEvents = [
  'container.life-cycle.created',
  'container.life-cycle.died',
  'container.life-cycle.started',
  'container.network.attached',
  'container.state.polled',
  'dock.removed',
  'docker.events-stream.connected',
  'docker.events-stream.disconnected',
  'github.pushed',
  'github.pull-request.opened',
  'github.pull-request.synchronized',
  'instance.expired',
  'instance.started',
  'organization.payment-method.added',
  'stripe.invoice.payment-succeeded',
  'org.user.private-key.secured'
]

var opts = {
  name: 'test-publisher',
  hostname: process.env.RABBITMQ_HOSTNAME,
  password: process.env.RABBITMQ_PASSWORD,
  port: process.env.RABBITMQ_PORT,
  username: process.env.RABBITMQ_USERNAME,
  events: publishedEvents
}
var rabbitPublisher = new Publisher(opts)

var started = false
function startApi (done) {
  if (started) { return done() }
  started = true
  sinon.stub(rabbitMQ, 'pushImage')
  sinon.stub(rabbitMQ, 'clearContainerMemory')

  rabbitPublisher.connect()
    .then(function (err) {
      if (err) { return done(err) }
      api.start(function (err2) {
        if (err2) { return done(err2) }
        cleanMongo.removeEverything(function (err3) {
          if (err3) { return done(err3) }
          done()
        })
      })
    })
}

function stopApi (done) {
  rabbitMQ.pushImage.restore()
  rabbitMQ.clearContainerMemory.restore()
  if (!started) { return done() }
  started = false
  rabbitPublisher.disconnect()
  .then(function () {
    api.stop(done)
  })
}
