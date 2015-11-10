'use strict'

var async = require('async')
var api = require('../../../app')
var cleanMongo = require('./clean-mongo')
var exec = require('child_process').exec

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

var started = false
function startApi (done) {
  if (started) { return done() }
  started = true
  api.start(function (err) {
    if (err) { return done(err) }
    cleanMongo.removeEverything(function (err) {
      if (err) { return done(err) }
      ensureIndexes(done)
    })
  })
}

function stopApi (done) {
  if (!started) { return done() }
  started = false
  api.stop(done)
}
