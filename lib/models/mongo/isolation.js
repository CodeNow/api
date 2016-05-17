/**
 * @module lib/models/mongo/isolation
 */
'use strict'

var Boom = require('dat-middleware').Boom
var Promise = require('bluebird')
var mongoose = require('mongoose')

var Instance = require('models/mongo/instance')
var exists = require('101/exists')
var joi = require('utils/joi')

var IsolationSchema = require('models/mongo/schemas/isolation')

/**
 * Validate create arguments helper function.
 * @private
 * @param {Object} data Information to create Isolation group.
 * @see createIsolation
 * @returns {Promise} Rejected with error if invalid.
 */
IsolationSchema.statics._validateCreateData = function (data) {
  var masterSchema = joi.object().keys({
    instance: joi.objectIdString().required()
  })
  var childrenSchema = joi.object().keys({
    org: joi.string().required(),
    repo: joi.string().required(),
    branch: joi.string().required()
  })
  var schema = joi.object().keys({
    master: joi.objectIdString().required(),
    children: joi.array().items(masterSchema, childrenSchema).required(),
    redeployOnKilled: joi.boolean()
  }).label('data').required()
  return joi.validateOrBoomAsync(data, schema)
}

/**
 * Validate helper function that finds an Instance by ID and returns it if it is
 * not already isolated or belonging to an isolation group.
 * @param {String} instanceId ID of the Instance to verify.
 * @returns {Promise} Resolved with the Instance if it is able to be isolated.
 */
IsolationSchema.statics._validateMasterNotIsolated = function (instanceId) {
  return Promise.try(function () {
    if (!exists(instanceId)) {
      throw Boom.badImplementation('_validateMasterNotIsolated requires instanceId')
    }
  })
    .then(function () { return Instance.findByIdAsync(instanceId) })
    .then(function (instance) {
      if (!instance) {
        throw Boom.notFound('Instance not found.', { id: instanceId })
      }
      if (instance.isolated) {
        throw Boom.conflict(
          'Instance belongs to an isolation group.',
          { id: instanceId }
        )
      }
      if (instance.isIsolationGroupMaster) {
        throw Boom.conflict('Instance is already isolated.', { id: instanceId })
      }
      return instance
    })
}

/**
 * Create an Isolation group.
 * @param {Object} data Information to create Isolation group.
 * @param {ObjectId} data.master Instance ID of the 'master' we are isolating.
 * @param {Array<Object>} data.children List of other information with which to
 *   create Instances. This can be of the form { instance: [instance id] } or
 *   { org, repo, branch }. The former is good for non-repo containers, the
 *   latter for repo containers.
 * @returns {Promise} Resolved with new isolation group object.
 */
IsolationSchema.statics.createIsolation = function (data) {
  return Isolation._validateCreateData(data)
    .then(function () { return Isolation._validateMasterNotIsolated(data.master) })
    .then(function (masterInstance) {
      // TODO(bryan): fork other instances
      // var instancesToFork = data.children.filter(pluck('instance'))
      // var nonRepoContainersToFork = data.children.filter(pluck('repo'))
      var isolationOpts = {
        owner: { github: masterInstance.owner.github },
        createdBy: { github: masterInstance.createdBy.github },
        redeployOnKilled: data.redeployOnKilled || false
      }
      return Isolation.createAsync(isolationOpts)
    })
}

var Isolation = module.exports = mongoose.model('Isolation', IsolationSchema)

Promise.promisifyAll(Isolation)
