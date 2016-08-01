'use strict'

var ContextVersion = require('models/mongo/context-version')
var Instance = require('models/mongo/instance')
var Docker = require('models/apis/docker')
var log = require('middlewares/logger')(__filename).log

module.exports.emitBuildComplete = emitBuildComplete

function emitBuildComplete (cv, failure, error) {
  log.trace({cv: cv, stack: new Error().stack}, 'emitBuildComplete')
  if (!cv) {
    var err = new Error('you forgot to pass cv to emitBuildComplete')
    log.fatal({err: err}, err.message)
    throw err
  }
  if (cv.toJSON) {
    cv = cv.toJSON()
  }
  var containerId = cv.build && cv.build.dockerContainer
  if (!containerId) {
    ContextVersion.findById(cv._id, function (err, cv) {
      if (err) { throw err }
      emitBuildComplete(cv, failure)
    })
    return
  }
  var docker = new Docker()
  var signal = failure ? 'SIGKILL' : 'SIGINT'
  require('./mocks/docker/build-logs.js')(failure, error)
  // this will "kill" the container which will emit a die event
  // and exitCode will be 0 for SIGINT and 1 for SIGKILL .. docker-mock
  docker.docker.getContainer(containerId).kill({ signal: signal }, function (err) {
    if (err) { throw err }
  })
}
