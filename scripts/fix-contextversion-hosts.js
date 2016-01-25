'use strict'
require('loadenv')()
var ContextVersion = require('models/mongo/context-version.js')
var mongoose = require('mongoose')
mongoose.connect(process.env.MONGO)
var async = require('async')
var Dockerode = require('dockerode')
var hosts = [
  'http://10.0.1.210',
  'http://10.0.1.41',
  'http://10.0.1.10'
]
var counts = {
  gone: 0,
  ok: 0,
  update: 0,
  err: 0
}
function getCorrectDock (dockerTag, cb) {
  async.detect(hosts, function (host, cb) {
    new Dockerode({
      host: host,
      port: 4242
    }).getImage(dockerTag).history(function (err) {
      if (err && err.statusCode === 404) {
        return cb(false)
      } else if (err) {
        console.log(' ERROR container history ', err)
        counts.err++
      }
      return cb(true)
    })
  }, cb)
}

async.waterfall([
  getAllContextVersion,
  eachContextVersion
], function (err) {
  if (err) {
    return console.log(' ERROR', err.stack)
  }
  mongoose.disconnect()
  console.log('done everything went well')
  console.log(counts)
})

function getAllContextVersion (cb) {
  console.log('getAllContextVersion')
  ContextVersion.find({
    'dockerHost': {
      $exists: true
    },
    'build.dockerTag': {
      $exists: true
    }
  }, cb)
}

function eachContextVersion (cvs, cb) {
  console.log('eachContextVersion')
  if (!cvs || cvs.length === 0) {
    return cb()
  }
  async.eachLimit(cvs, 100, function (cv, callback) {
    getCorrectDock(cv.build.dockerTag, function (host) {
      if (!host) {
        console.log(' ERROR', cv._id, 'container', cv.build.dockerTag, 'not exist on any dock')
        counts.gone++
      } else if (~host.indexOf(cv.dockerHost)) {
        counts.update++
      } else {
        counts.ok++
      }
      callback()
    })
  }, cb)
}
