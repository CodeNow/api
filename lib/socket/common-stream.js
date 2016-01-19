'use strict'

var error = require('error')
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
    data: model,
    sessionUser: sessionUser
  }
  var req = {
    sessionUser: sessionUser
  }
  log.info(logData, 'common-stream.checkOwnership')
  return Promise.any([
    Promise.fromCallback(function (callback) {
      me.isOwnerOf(model)(req, {}, callback)
    }),
    Promise.fromCallback(function (callback) {
      me.isModerator(model)(req, {}, callback)
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
function onValidateFailure (moduleName, socket, logData) {
  return function (err) {
    log.warn(put({
      err: err
    }, logData), moduleName + ' failed')
    error.log(err)
    socket.write({
      id: socket.id,
      error: 'You don\'t have access to this stream'
    })
    throw err
  }
}
module.exports = {
  checkOwnership: checkOwnership,
  onValidateFailure: onValidateFailure
}
