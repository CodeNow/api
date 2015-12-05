'use strict'

var async = require('async')
var api = require('../../../app')
var cleanMongo = require('./clean-mongo')
var exec = require('child_process').exec
var put = require('101/put')
var Hermes = require('runnable-hermes')

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
  'container.network.attach-failed',
  'dock-removed'
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
