'use strict'

var Boom = require('dat-middleware').Boom
var exists = require('101/exists')
var pick = require('101/pick')
var Promise = require('bluebird')

var Instance = require('models/mongo/instance')
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

IsolationService.deleteIsolationAndEmitInstanceUpdates = function (isolationId, sessionUser) {
  return Promise.try(function () {
    if (!exists(isolationId)) {
      throw Boom.badImplementation('isolationId is required')
    }
    if (!exists(sessionUser)) {
      throw Boom.badImplementation('sessionUser is required')
    }
  })
    .then(function () {
      // Right now, we're only ever marking ONE instance as isolated. When that
      // changes, we're going to need to do more than findOne.
      var findOpts = {
        isolated: isolationId
      }
      return Instance.findOneAsync(findOpts)
        .then(function (masterInstance) {
          if (!masterInstance) {
            return Boom.notFound('No Instance found for that Isolation Group')
          }
          return masterInstance.deIsolate()
        })
        .then(function (updatedMasterInstance) {
          var removeOpts = {
            _id: isolationId
          }
          return Isolation.findOneAndRemoveAsync(removeOpts)
            .thenReturn(updatedMasterInstance)
        })
        .then(function (updatedMasterInstance) {
          return updatedMasterInstance.emitInstanceUpdateAsync(sessionUser, 'isolation')
            .catch(function (err) {
              var logData = {
                instanceId: updatedMasterInstance._id.toString(),
                err: err
              }
              log.warn(logData, 'isolation service delete failed to emit instance updates')
            })
        })
    })
}

module.exports = IsolationService
