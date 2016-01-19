/**
 * Instance fork service to provide forks of instances!
 * @module lib/models/services/instance-fork-service
 */
'use strict'

var Context = require('models/mongo/context')
var ContextService = require('models/services/context-service')
var ContextVersion = require('models/mongo/context-version')
var Promise = require('bluebird')
var isObject = require('101/is-object')
var keypather = require('keypather')()

function InstanceForkService () {}

module.exports = InstanceForkService

/**
 * Helper function for autoFork that actually does the gruntwork to fork an
 * instance.
 * @private
 * @param {Object} instance Instance object of which to fork.
 * @param {Object} instance.contextVersion Instance's Context Version.
 * @param {String} instance.contextVersion.context Instance's Context.
 * @param {Object} pushInfo GitHub push information.
 * @param {String} pushInfo.repo GitHub Repository.
 * @param {String} pushInfo.branch GitHub Branch.
 * @param {String} pushInfo.commit GitHub Commit.
 * @param {Object} pushInfo.user GitHub User object.
 * @param {String} pushInfo.user.id GitHub User ID.
 * @returns {Promise} Resolved with new Context Version.
 */
InstanceForkService._autoFork = function (instance, pushInfo) {
  var contextVersion = keypather.get(instance, 'contextVersion')
  var contextId = keypather.get(contextVersion, 'context')
  var pushInfoGithubId = keypather.get(pushInfo, 'user.id')
  return Promise.try(function () {
    if (!instance) {
      throw new Error('_autoFork requires an instance')
    }
    if (!contextVersion) {
      throw new Error('_autoFork requires an instance.contextVersion')
    }
    if (!contextId) {
      throw new Error('_autoFork requires an instance.contextVersion.context')
    }
    if (!isObject(pushInfo)) {
      throw new Error('_autoFork requires the pushInfo')
    }
    ;[ 'repo', 'branch', 'commit' ].forEach(function (k) {
      if (!pushInfo[k]) {
        throw new Error('_autoFork requires pushInfo.' + k)
      }
    })
    if (!pushInfoGithubId) {
      throw new Error('_autoFork requires pushInfo to contain a user id')
    }
  })
    .then(function () {
      return Promise.fromCallback(
        Context.findOne.bind(Context, { _id: contextId })
      )
    })
    .then(function (context) {
      var contextOwnerGithubId = keypather.get(context, 'owner.github')
      if (!contextOwnerGithubId) {
        throw new Error('_autoFork requires the context to have an owner')
      }
      return Promise.fromCallback(function (callback) {
        var user = {
          accounts: {
            github: {
              id: pushInfoGithubId
            }
          }
        }
        var opts = {
          owner: {
            github: contextOwnerGithubId
          }
        }
        ContextService.handleVersionDeepCopy(
          context,
          contextVersion,
          user,
          opts,
          callback
        )
      })
    })
    .then(function (newContextVersion) {
      return Promise.fromCallback(function (callback) {
        ContextVersion.modifyAppCodeVersionByRepo(
          newContextVersion._id.toString(),
          pushInfo.repo,
          pushInfo.branch,
          pushInfo.commit,
          callback
        )
      })
    })
}

/**
 * Instance forking functionality.
 * @param {Array<Object>} instances List of Instances to fork.
 * @param {Object} pushInfo GitHub push information.
 * @param {String} pushInfo.repo GitHub Repository.
 * @param {String} pushInfo.branch GitHub Branch.
 * @param {String} pushInfo.commit GitHub Commit.
 * @param {Object} pushInfo.user GitHub User object.
 * @param {String} pushInfo.user.id GitHub User ID.
 * @returns {Promise} Resolved with an array of new Context Versions.
 */
InstanceForkService.autoFork = function (instances, pushInfo) {
  return Promise.try(function () {
    if (!Array.isArray(instances)) {
      throw new Error('autoFork requires instances to be an array')
    }
    if (!isObject(pushInfo)) {
      throw new Error('autoFork requires pushInfo to be provided')
    }
  })
    .then(function () {
      return Promise.map(instances, function (instance) {
        return InstanceForkService._autoFork(instance, pushInfo)
      })
    })
}
