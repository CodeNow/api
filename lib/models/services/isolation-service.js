'use strict'

var Boom = require('dat-middleware').Boom
var exists = require('101/exists')
var pick = require('101/pick')
var Promise = require('bluebird')

var Instance = require('models/mongo/instance')
var InstanceForkService = require('models/services/instance-fork-service')
var Isolation = require('models/mongo/isolation')
var log = require('middlewares/logger')(__filename).log

function IsolationService () {}

/**
 * Fork a non-repo child instance into an isolation group.
 * @param {ObjectId} instanceId Instance ID to fork.
 * @param {ObjectId} isolationId Isolation ID with which to mark the new
 *   Instance.
 * @param {Object} sessionUser Session User object for created by information.
 * @returns {Promise} Resolves with new, isolated Instance.
 */
IsolationService.forkNonRepoChild = function (instanceId, isolationId, sessionUser) {
  return Promise.try(function () {
    if (!exists(instanceId)) {
      throw new Error('forkNonRepoChild instanceId is required')
    }
    if (!exists(isolationId)) {
      throw new Error('forkNonRepoChild isolationId is required')
    }
    if (!exists(sessionUser)) {
      throw new Error('forkNonRepoChild sessionUser is required')
    }
  })
    .then(function () {
      return Instance.findByIdAsync(instanceId)
        .then(function (instance) {
          return InstanceForkService._forkNonRepoInstance(
            instance,
            isolationId,
            sessionUser
          )
        })
    })
}

/**
 * Create an Isolation and put Instances in the group. This currently creates an
 * Isolation and then modifies the master Instance to be the master of the
 * isolation group. This also will emit events for each modified Instance.
 * @param {Object} data Data for creating Isolation.
 * @param {ObjectId} data.master ID of the Instace which will be the master.
 * @param {Array<Object>} data.children Currently not used.
 * @param {Object} sessionUser Session User for sending messages over primus.
 * @returns {Promise} Resolves with the new Isolation after all messages have
 *   been sent.
 */
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
        .then(function () { return Isolation._validateMasterNotIsolated(data.master) })
        .then(function (masterInstance) {
          return Isolation.createIsolation(data)
            .then(function (newIsolation) {
              return {
                newIsolation: newIsolation,
                masterInstance: masterInstance
              }
            })
        })
        .then(function (models) {
          // isolate as master (pass true as second parameter)
          return models.masterInstance.isolate(models.newIsolation._id, true)
            .then(function (updatedMasterInstance) {
              models.masterInstance = updatedMasterInstance
              return models
            })
        })
        .then(function (models) {
          var nonRepoChildren = data.children.filter(pick('instance'))
          return Promise.map(
            nonRepoChildren,
            function (child) {
              return IsolationService.forkNonRepoChild(
                child.instance,
                models.newIsolation._id,
                sessionUser
              )
            }
          )
            .then(function (newInstances) {
              models.nonRepoChildren = newInstances
              return models
            })
        })
        .then(function (models) {
          return Promise.all([
            IsolationService._emitUpdateForInstances([models.masterInstance], sessionUser),
            IsolationService._emitUpdateForInstances(models.nonRepoChildren, sessionUser)
          ])
            .return(models)
        })
        .then(function (models) { return models.newIsolation })
    })
}

/**
 * Helper function to send updates for instances. Catches any errors from event
 * emitting.
 * @param {Array<Object>} instances Instance models to emit events.
 * @param {Object} sessionUser Session User for emitting updates.
 * @returns {Promise} Resolved when all events emitted.
 */
IsolationService._emitUpdateForInstances = function (instances, sessionUser) {
  return Promise.try(function () {
    if (!exists(instances)) {
      throw new Error('_emitUpdateForInstances instances are required')
    }
    if (!exists(sessionUser)) {
      throw new Error('_emitUpdateForInstances sessionUser is required')
    }
  })
    .then(function () {
      return Promise.each(
        instances,
        function (instance) {
          return instance.emitInstanceUpdateAsync(sessionUser, 'isolation')
            .catch(function (err) {
              var logData = {
                instanceId: instance._id,
                err: err
              }
              log.warn(logData, 'isolation service failed to emit instance updates')
            })
        }
      )
    })
}

/**
 * Removes all Instances from Isolation and deletes the Isolation. This modifies
 * all Instances that are in the Isolation and then deletes the Isolation model
 * from the database.
 * @param {ObjectId} isolationId ID of the Isolation to remove.
 * @param {Object} sessionUser Session User for sending messages over primus.
 * @returns {Promise} Resolves when all actions complete.
 */
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
            .return(updatedMasterInstance)
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
