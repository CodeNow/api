'use strict'
var keypather = require('keypather')()
var Promise = require('bluebird')
var put = require('101/put')

var logger = require('logger')

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
  onValidateFailure: onValidateFailure,
  validateDataArgs: Promise.method(validateDataArgs)
}
