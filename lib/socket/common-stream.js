'use strict'
var keypather = require('keypather')()
var Promise = require('bluebird')
var put = require('101/put')

var logger = require('logger')
var me = require('middlewares/me')

function checkOwnership (sessionUser, model) {
  if (model.toJSON) {
    model = model.toJSON()
  }
  var req = {
    sessionUser: sessionUser,
    model: model
  }
  var log = logger.child({
    modelId: model._id,
    sessionUser: sessionUser,
    method: 'checkOwnership'
  })
  log.info('common-stream.checkOwnership')
  return Promise.any([
    Promise.fromCallback(function (callback) {
      me.isOwnerOf('model')(req, {}, callback)
    }),
    Promise.fromCallback(function (callback) {
      me.isModerator(req, {}, callback)
    })
  ])
  .catch(function (err) {
    log.warn({ err: err }, 'failed')
    throw err
  })
}
function onValidateFailure (moduleName, socket, handlerId, logData) {
  return function (err) {
    logger.warn(put({
      err: err
    }, logData), moduleName + ' failed')
    keypather.set(err, 'data.level', 'warning')
    socket.write({
      id: handlerId,
      error: 'You don\'t have access to this stream',
      message: err.message
    })
    throw err
  }
}
function validateDataArgs (data, argsArray) {
  if (!argsArray.every(data.hasOwnProperty.bind(data))) {
    throw new Error(argsArray.join(' and ') + ' are required')
  }
}
module.exports = {
  checkOwnership: checkOwnership,
  onValidateFailure: onValidateFailure,
  validateDataArgs: Promise.method(validateDataArgs)
}
