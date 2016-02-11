'use strict'
require('loadenv')()
var Instance = require('models/mongo/instance.js')
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
function getCorrectDock (containerId, cb) {
  async.detect(hosts, function (host, cb) {
    new Dockerode({
      host: host,
      port: 4242
    }).getContainer(containerId).inspect(function (err) {
      if (err && err.statusCode === 404) {
        return cb(false)
      } else if (err) {
        console.log(' ERROR container inspect ', err)
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
  console.log('done everything went well')
  console.log(counts)
  mongoose.disconnect()
})

function getAllContextVersion (cb) {
  console.log('getAllContextVersion')
  Instance.find({
    'container.dockerHost': {
      $exists: true
    },
    'container.dockerContainer': {
      $exists: true
    }
  }, cb)
}

function eachContextVersion (cvs, cb) {
  console.log('eachContextVersion')
  if (!cvs || cvs.length === 0) {
    return cb()
  }
  async.eachLimit(cvs, 1000, function (cv, callback) {
    getCorrectDock(cv.container.dockerContainer, function (host) {
      if (!host) {
        counts.gone++
        return callback()
      }
      host = host + ':4242'
      if (!~host.indexOf(cv.container.dockerHost)) {
        counts.update++
      } else {
        counts.ok++
      }
      callback()
    })
  }, cb)
}
