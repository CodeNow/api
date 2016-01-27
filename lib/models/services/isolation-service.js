'use strict'

var Boom = require('dat-middleware').Boom
var exists = require('101/exists')
var pick = require('101/pick')
var Promise = require('bluebird')

var Isolation = require('models/mongo/isolation')
var log = require('middlewares/logger')(__filename).log

function IsolationService () {}

IsolationService.createIsolationAndEmitInstanceUpdates = function (data, sessionUser) {
  return Promise.try(function () {
    if (!exists(data)) {
      throw Boom.badImplementation('data is required')
    }
    if (!exists(sessionUser)) {
      throw Boom.badImplementation('sessionUser is required')
    }
  })
    .then(function () {
      data = pick(data, [ 'master', 'children' ])
      return Isolation._validateCreateData(data)
        .thenReturn(Isolation._validateMasterNotIsolated(data.master))
        .then(function (masterInstance) {
          return Isolation.createIsolation(data)
            .then(function (newIsolation) {
              // isolate as master (pass true as second parameter)
              return masterInstance.isolate(newIsolation._id, true)
                .then(function (updatedMasterInstance) {
                  return updatedMasterInstance.emitInstanceUpdateAsync(sessionUser, 'isolation')
                    .catch(function (err) {
                      var logData = {
                        instanceId: data.master,
                        err: err
                      }
                      log.warn(logData, 'isolation service create failed to emit instance updates')
                    })
                })
                .thenReturn(newIsolation)
            })
        })
    })
}

module.exports = IsolationService
