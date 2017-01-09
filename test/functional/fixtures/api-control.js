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
var exec = require('child_process').exec
var rabbitMQ = require('models/rabbitmq')

module.exports = {
  start: startApi,
  stop: stopApi
}

function ensureIndex (script, cb) {
  var mongoCmd = [
    'mongo',
    '--eval', script,
    process.env.MONGO.split('/').pop() // db name only
  ].join(' ')
  exec(mongoCmd, cb)
}

// This was added because of circle ci
// circleci is not applying mongodb indexes immediately for some reason.
// that break few tests
function ensureIndexes (cb) {
  var scripts = [
    '"db.instances.ensureIndex({\'lowerName\':1,\'owner.github\':1}, {unique:true})"',
    '"db.settings.ensureIndex({\'owner.github\':1}, {unique:true})"'
  ]
  async.each(scripts, ensureIndex, cb)
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
  'instance.expired',
  'instance.started',
  'organization.payment-method.added',
  'invoice.payment_succeeded'
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
          ensureIndexes(done)
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
