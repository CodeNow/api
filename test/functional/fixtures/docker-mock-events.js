'use strict'

var ContextVersion = require('models/mongo/context-version')
var Instance = require('models/mongo/instance')
var dockerMock = require('docker-mock')
var Docker = require('models/apis/docker')

module.exports.emitBuildComplete = emitBuildComplete
module.exports.emitContainerDie = emitContainerDie

function emitBuildComplete (cv, failure) {
  if (!cv) {
    var err = new Error('you forgot to pass cv to emitBuildComplete')
    console.error(err.stack)
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
  var docker = new Docker(process.env.SWARM_HOST)
  var signal = failure ? 'SIGKILL' : 'SIGINT'
  require('./mocks/docker/build-logs.js')(failure)
  // this will "kill" the container which will emit a die event
  // and exitCode will be 0 for SIGINT and 1 for SIGKILL .. docker-mock
  docker.docker.getContainer(containerId).kill({ signal: signal }, function (err) {
    if (err) { throw err }
  })
}
function emitContainerDie (instance) {
  if (instance.toJSON) {
    instance = instance.toJSON()
  }
  var containerId = instance.container && instance.container.dockerContainer
  if (!containerId) {
    Instance.findById(instance._id, function (err, instance) {
      if (err) { throw err }
      emitContainerDie(instance)
    })
    return
  }
  dockerMock.events.stream.emit('data',
    JSON.stringify({
      status: 'die',
      from: process.env.DOCKER_IMAGE_BUILDER_NAME + ':' + process.env.DOCKER_IMAGE_BUILDER_VERSION,
      id: containerId
    }))
}
