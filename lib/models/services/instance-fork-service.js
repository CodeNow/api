/**
 * Instance fork service to provide forks of instances!
 * @module lib/models/services/instance-fork-service
 */
'use strict'

var Context = require('models/mongo/context')
var ContextService = require('models/services/context-service')
var ContextVersion = require('models/mongo/context-version')
var Promise = require('bluebird')
var PullRequest = require('models/apis/pullrequest')
var Runnable = require('models/apis/runnable')
var Slack = require('notifications/index')
var Timers = require('models/apis/timers')
var User = require('models/mongo/user')
var dogstatsd = require('models/datadog')
var isObject = require('101/is-object')
var keypather = require('keypather')()
var log = require('middlewares/logger')(__filename).log

function InstanceForkService () {}

module.exports = InstanceForkService

/**
 * Helper function to validate pushInfo in various places. Throws an error if
 * any problem is found.
 * @private
 * @param {Object} pushInfo GitHub push information.
 * @param {String} pushInfo.repo GitHub Repository.
 * @param {String} pushInfo.branch GitHub Branch.
 * @param {String} pushInfo.commit GitHub Commit.
 * @param {Object} pushInfo.user GitHub User object.
 * @param {String} pushInfo.user.id GitHub User ID.
 * @param [String] funcName Function name to prepend errors.
 * @returns {Promise} Resolved when fields are validated.
 */
InstanceForkService._validatePushInfo = function (pushInfo, funcName) {
  return Promise.try(function () {
    if (!isObject(pushInfo)) {
      throw new Error(funcName + ' requires pushInfo')
    }
    ;[ 'repo', 'branch', 'commit' ].forEach(function (k) {
      if (!pushInfo[k]) {
        throw new Error(funcName + ' requires pushInfo.' + k)
      }
    })
    if (!keypather.get(pushInfo, 'user.id')) {
      throw new Error(funcName + ' requires pushInfo to contain user.id')
    }
  })
}

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
InstanceForkService._createNewContextVersion = function (instance, pushInfo) {
  var contextVersion = keypather.get(instance, 'contextVersion')
  var contextId = keypather.get(contextVersion, 'context')
  var pushInfoGithubId = keypather.get(pushInfo, 'user.id')
  return Promise.try(function () {
    if (!instance) {
      throw new Error('_createNewContextVersion requires an instance')
    }
    if (!contextVersion) {
      throw new Error('_createNewContextVersion requires an instance.contextVersion')
    }
    if (!contextId) {
      throw new Error('_createNewContextVersion requires an instance.contextVersion.context')
    }
    return InstanceForkService._validatePushInfo(pushInfo, '_createNewContextVersion')
  })
    .then(function () {
      return Promise.fromCallback(
        Context.findOne.bind(Context, { _id: contextId })
      )
    })
    .then(function (context) {
      var contextOwnerGithubId = keypather.get(context, 'owner.github')
      if (!contextOwnerGithubId) {
        throw new Error('_createNewContextVersion requires the context to have an owner')
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
 * Notify external services about Instance fork. Notifies GitHub and Slack.
 * @private
 * @param {Object} data Data object.
 * @param {Object} data.instance New Instance for which to create notifications.
 * @param {Object} data.accessToken Access token of push user or Instance owner.
 * @param {Object} data.pushInfo Push information from GitHub (see other
 *   functions for description of this object).
 * @returns {Promise} Resolved when all notifications are started (may complete
 *   in the background).
 */
InstanceForkService._notifyExternalServices = function (data) {
  var instance = keypather.get(data, 'instance')
  var accessToken = keypather.get(data, 'accessToken')
  var pushInfo = keypather.get(data, 'pushInfo')
  return Promise.try(function () {
    if (!isObject(data)) {
      throw new Error('_notifyExternalServices data object is required')
    }
    if (!instance) {
      throw new Error('_notifyExternalServices data.instance is required')
    }
    if (!accessToken) {
      throw new Error('_notifyExternalServices data.accessToken is required')
    }
    return InstanceForkService._validatePushInfo(pushInfo, '_notifyExternalServices')
  })
    .then(function () {
      var pullRequest = new PullRequest(accessToken)
      pullRequest.deploymentSucceeded(pushInfo, instance)
      Slack.sendSlackAutoForkNotification(pushInfo, instance)
    })
}

/**
 * Instance forking functionality.
 * @private
 * @param {Array<Object>} instances List of Instances to fork.
 * @param {Object} pushInfo GitHub push information.
 * @param {String} pushInfo.repo GitHub Repository.
 * @param {String} pushInfo.branch GitHub Branch.
 * @param {String} pushInfo.commit GitHub Commit.
 * @param {Object} pushInfo.user GitHub User object.
 * @param {String} pushInfo.user.id GitHub User ID.
 * @returns {Promise} Resolved with an array of new Context Versions.
 */
InstanceForkService._forkOne = function (instance, pushInfo) {
  dogstatsd.increment('api.instance-fork-service.fork-one')
  var instanceUserGithubId = keypather.get(instance, 'createdBy.github')
  var instanceOwnerGithubId = keypather.get(instance, 'owner.github')
  return Promise.try(function () {
    if (!instance) {
      throw new Error('_forkOne instance is required')
    }
    if (!instanceUserGithubId) {
      throw new Error('_forkOne instance.createdBy.github is required')
    }
    return InstanceForkService._validatePushInfo(pushInfo, '_forkOne')
  })
    .then(function () {
      return Promise.props({
        instanceUser: Promise.fromCallback(function (callback) {
          User.findByGithubId(instanceUserGithubId, callback)
        }),
        pushUser: Promise.fromCallback(function (callback) {
          User.findByGithubId(pushInfo.user.id, callback)
        })
      })
    })
    .then(function (result) {
      var instanceUser = result.instanceUser
      var pushUser = result.pushUser
      // 1. create a new context version
      return InstanceForkService._createNewContextVersion(instance, pushInfo)
        // 2. create new build and build it
        .then(function (newContextVersion) {
          var runnable = Runnable.create({}, instanceUser)
          return Promise.fromCallback(function (callback) {
            runnable.createAndBuildBuild(
              newContextVersion._id.toString(),
              instanceOwnerGithubId,
              pushInfo.repo,
              pushInfo.commit,
              callback
            )
          })
        })
        // 3. fork master instance with new build
        .then(function (newBuild) {
          return Promise.fromCallback(function (callback) {
            var runnable = Runnable.create({}, pushUser || instanceUser)
            runnable.forkMasterInstance(
              instance,
              newBuild._id.toString(),
              pushInfo.branch,
              callback
            )
          })
          .catch(function (err) {
            // TODO(bryan): deal with this error. likely re-throw
            console.error('need to deal with this:', err)
            throw err
          })
        })
        // 4. notify any external services about the new udpate
        .then(function (forkedInstance) {
          var tokenLocation = 'accounts.github.accessToken'
          var accessToken = keypather.get(pushUser, tokenLocation) ||
            keypather.get(instanceUser, tokenLocation)
          return InstanceForkService._notifyExternalServices({
            instance: forkedInstance,
            accessToken: accessToken,
            pushInfo: pushInfo
          })
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
  var timer = new Timers()
  dogstatsd.increment('api.instance-fork-service.auto-fork')
  return Promise.try(function () {
    if (!Array.isArray(instances)) {
      throw new Error('autoFork requires instances to be an array')
    }
    if (!isObject(pushInfo)) {
      throw new Error('autoFork requires pushInfo to be provided')
    }
  })
    .then(function () {
      return Promise.fromCallback(function (callback) {
        timer.startTimer('github_push_autofork', callback)
      })
    })
    .then(function () {
      return Promise.map(instances, function (instance) {
        return InstanceForkService._forkOne(instance, pushInfo)
          .catch(function (err) {
            // log the error and return null
            var data = {
              err: err,
              instance: instance._id,
              pushInfo: pushInfo
            }
            log.error(data, 'autoFork error from _forkOne')
            return null
          })
      })
    })
    .finally(function () {
      return Promise.fromCallback(function (callback) {
        // ignore errors from stopTimer; if validation failed, the timer was
        // never created, and this will callback an error.
        timer.stopTimer('github_push_autofork', function () { callback() })
      })
    })
}
