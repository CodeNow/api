'use strict'

// var Instance = require('models/mongo/instance')
var Isolation = require('models/mongo/isolation')
// var Promise = require('bluebird')
var log = require('middlewares/logger')(__filename).log

function IsolationService () {}

IsolationService.createIsolationAndEmitInstanceUpdates = function (data) {
  var sessionUser = data.sessionUser
  delete data.sessionUser
  return Isolation._validateCreateData(data)
    .thenReturn(Isolation._validateMasterNotIsolated(data.master))
    .then(function (masterInstance) {
      return Isolation.createIsolation(data)
        .then(function (newIsolation) {
          return masterInstance.isolate(newIsolation)
            .then(function (updatedMasterInstance) {
              return masterInstance.emitInstanceUpdateAsync(sessionUser, 'isolation')
                .catch(function (err) {
                  var logData = {
                    instanceId: data.master,
                    err: err
                  }
                  log.warn(logData, 'isolation service failed to emit instance updates')
                })
            })
            .thenReturn(newIsolation)
        })
    })
}

module.exports = IsolationService
