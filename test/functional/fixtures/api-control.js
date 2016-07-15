'use strict'

var authMiddlewares = require('middlewares/auth')
var sinon = require('sinon')
if (!authMiddlewares.requireWhitelist.isSinonProxy) {
  // Duck it, we never need to restore this stub anyways right?
  sinon.stub(authMiddlewares, 'requireWhitelist').callsArg(2)
}

var api = require('../../../app')
var async = require('async')
var cleanMongo = require('./clean-mongo')
var exec = require('child_process').exec
var Hermes = require('runnable-hermes')
var put = require('101/put')

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
  'container.network.attached',
  'dock.removed',
  'docker.events-stream.connected',
  'docker.events-stream.disconnected'
]

var opts = {
  hostname: process.env.RABBITMQ_HOSTNAME,
  password: process.env.RABBITMQ_PASSWORD,
  port: process.env.RABBITMQ_PORT,
  username: process.env.RABBITMQ_USERNAME,
  name: 'mavis-sauron'
}
var rabbitPublisher = new Hermes(put({
  publishedEvents: publishedEvents
}, opts))

var started = false
function startApi (done) {
  if (started) { return done() }
  started = true
  rabbitPublisher.connect(function (err) {
    if (err) { return done(err) }
    api.start(function (err) {
      if (err) { return done(err) }
      cleanMongo.removeEverything(function (err) {
        if (err) { return done(err) }
        ensureIndexes(done)
      })
    })
  })
}

function stopApi (done) {
  if (!started) { return done() }
  started = false
  rabbitPublisher.close(function (err) {
    if (err) {
      return done()
    }
    api.stop(done)
  })
}
