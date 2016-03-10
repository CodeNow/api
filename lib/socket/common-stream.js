'use strict'

var error = require('error')
var keypather = require('keypather')()
var log = require('middlewares/logger')(__filename).log
var me = require('middlewares/me')
var Promise = require('bluebird')
var put = require('101/put')

function checkOwnership (sessionUser, model) {
  if (model.toJSON) {
    model = model.toJSON()
  }
  var logData = {
    tx: true,
    modelId: model._id,
    sessionUser: sessionUser
  }
  var req = {
    sessionUser: sessionUser,
    model: model
  }
  log.info(logData, 'common-stream.checkOwnership')
  return Promise.any([
    Promise.fromCallback(function (callback) {
      me.isOwnerOf('model')(req, {}, callback)
    }),
    Promise.fromCallback(function (callback) {
      me.isModerator(req, {}, callback)
    })
  ])
  .catch(function (err) {
    log.warn(put({
      tx: true,
      err: err
    }, logData), 'checkOwnership failed')
    throw err
  })
}
function onValidateFailure (moduleName, socket, handlerId, logData) {
  return function (err) {
    log.warn(put({
      err: err
    }, logData), moduleName + ' failed')
    keypather.set(err, 'data.level', 'warning')
    error.log(err)
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
