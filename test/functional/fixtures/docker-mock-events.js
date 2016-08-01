'use strict'

var ContextVersion = require('models/mongo/context-version')
var Instance = require('models/mongo/instance')
var Docker = require('models/apis/docker')
var log = require('middlewares/logger')(__filename).log
var mockOnBuilderDieMessage = require('../../integration/fixtures/dockerListenerEvents/on-image-builder-container-die')

module.exports.emitBuildComplete = emitBuildComplete

function emitBuildComplete (cv, failure, user) {
  console.log('xxxxxx1213213123')
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
      emitBuildComplete(cv, failure, user)
    })
    return
  }
  var signal = failure ? 'SIGKILL' : 'SIGINT'
  var exitCode = failure ? 1: 0
  console.log('xxxxxx11111', user)
  var job = mockOnBuilderDieMessage(
    cv,
    {
      id: containerId
    },
    user,
    exitCode)
  console.log('xxxxxx', job)

}
