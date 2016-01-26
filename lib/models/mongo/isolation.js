/**
 * @module lib/models/mongo/isolation
 */
'use strict'

var joi = require('utils/joi')
var mongoose = require('mongoose')

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
    children: joi.array().items(masterSchema, childrenSchema).required()
  }).label('data').required()
  return joi.validateOrBoomAsync(data, schema)
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
}

var Isolation = module.exports = mongoose.model('Isolation', IsolationSchema)
