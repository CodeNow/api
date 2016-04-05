/**
 * Create context versions to build, create and build builds
 * @module lib/models/services/build-service
 */
'use strict'

var Promise = require('bluebird')
var isObject = require('101/is-object')
var keypather = require('keypather')()
var pick = require('101/pick')

var logger = require('logger')
var Context = require('models/mongo/context')
var ContextService = require('models/services/context-service')
var ContextVersion = require('models/mongo/context-version')
var Runnable = require('models/apis/runnable')
var User = require('models/mongo/user')

function BuildService () {}

BuildService.logger = logger.child({
  tx: true,
  module: 'BuildService'
})

module.exports = BuildService

/**
 * Helper function to validate pushInfo in various places. Throws an error if
 * any problem is found.
 * @private
 * @param {Object} pushInfo GitHub push information.
 * @param {String} pushInfo.repo GitHub Repository.
 * @param {String} pushInfo.branch GitHub Branch.
 * @param {String} pushInfo.commit GitHub Commit.
 * @param {String} pushInfo.commitLog GitHub Commit Log
 * @param {Object} pushInfo.user GitHub User object.
 * @param {Number} pushInfo.user.id GitHub User ID.
 * @param [String] funcName Function name to prepend errors.
 * @returns {Promise} Resolved when fields are validated.
 */
BuildService.validatePushInfo = function (pushInfo, funcName) {
  var log = this.logger.child({
    method: 'validatePushInfo',
    pushInfo: pushInfo,
    funcName: funcName
  })
  log.info('validating push info')
  return Promise.try(function () {
    if (!isObject(pushInfo)) {
      throw new Error(funcName + ' requires pushInfo')
    }
    ;[ 'repo', 'branch', 'commit' ].forEach(function (key) {
      if (!pushInfo[key]) {
        throw new Error(funcName + ' requires pushInfo.' + key)
      }
    })
    if (!keypather.get(pushInfo, 'user.id')) {
      throw new Error(funcName + ' requires pushInfo to contain user.id')
    }
  })
    .catch(function (err) {
      log.error({ err: err }, 'validation failed')
      throw err
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
 * @param {Number} pushInfo.user.id GitHub User ID.
 * @returns {Promise} Resolved with new Context Version.
 */
BuildService.createNewContextVersion = function (instance, pushInfo) {
  var log = this.logger.child({
    method: 'createNewContextVersion',
    instanceId: keypather.get(instance, '_id'),
    pushInfo: pushInfo
  })
  log.info('called')
  var contextVersion = keypather.get(instance, 'contextVersion')
  var contextId = keypather.get(contextVersion, 'context')
  var pushInfoGithubId = keypather.get(pushInfo, 'user.id')
  return Promise.try(function () {
    if (!instance) {
      throw new Error('createNewContextVersion requires an instance')
    }
    if (!contextVersion) {
      throw new Error('createNewContextVersion requires an instance.contextVersion')
    }
    if (!contextId) {
      throw new Error('createNewContextVersion requires an instance.contextVersion.context')
    }
    return BuildService.validatePushInfo(pushInfo, 'createNewContextVersion')
  })
    .then(function () {
      return Promise.fromCallback(
        Context.findOne.bind(Context, { _id: contextId })
      )
    })
    .then(function (context) {
      var contextOwnerGithubId = keypather.get(context, 'owner.github')
      if (!contextOwnerGithubId) {
        throw new Error('createNewContextVersion requires the context to have an owner')
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
      return ContextVersion.modifyAppCodeVersionByRepoAsync(
        newContextVersion._id.toString(),
        pushInfo.repo,
        pushInfo.branch,
        pushInfo.commit
      )
    })
    .catch(function (err) {
      log.error({ err: err }, 'errored creating a new context version')
      throw err
    })
}

/**
 * Instance forking functionality. We do the following things:
 * 1 - Create a new Context Version
 * 2 - Create a new Build (and build it)
 * @param {Object} instance Instance to Fork.
 * @param {Object} pushInfo GitHub push information.
 * @param {String} pushInfo.repo GitHub Repository.
 * @param {String} pushInfo.branch GitHub Branch.
 * @param {String} pushInfo.commit GitHub Commit.
 * @param {Object} pushInfo.user GitHub User object.
 * @param {Number} pushInfo.user.id GitHub User ID.
 * @param {String} name of the triggeredAction: autodeploy, autolaunch, isolation
 * @returns {Promise} Resolves with { build: build, user: user }
 */
BuildService.createAndBuildContextVersion = function (instance, pushInfo, triggeredActionName) {
  var log = this.logger.child({
    method: 'createAndBuildContextVersion',
    instanceId: keypather.get(instance, '_id'),
    pushInfo: pushInfo
  })
  log.info('called')
  var instanceUserGithubId = keypather.get(instance, 'createdBy.github')
  var instanceOwnerGithubId = keypather.get(instance, 'owner.github')
  return Promise.try(function () {
    if (!instance) {
      throw new Error('Instance is required')
    }
    if (!instanceUserGithubId) {
      throw new Error('instance.createdBy.github is required')
    }
    return BuildService.validatePushInfo(pushInfo, 'createAndBuildContextVersion')
  })
    .then(function () {
      log.trace('fetch users')
      return Promise.props({
        // instanceUser is the owner of the instance.
        instanceUser: User.findByGithubIdAsync(instanceUserGithubId),
        // pushUser is the user who pushed to GitHub (if we have the user in
        // our database).
        pushUser: User.findByGithubIdAsync(pushInfo.user.id)
      })
    })
    .then(function (result) {
      log.trace('create new cv')
      var instanceUser = result.instanceUser
      var pushUser = result.pushUser
      // 1. create a new context version.
      return BuildService.createNewContextVersion(instance, pushInfo)
        // 2. create new build and build it.
        .then(function (newContextVersion) {
          // the instanceUser needs to create the build (it's someone who is
          // known to be in our system).
          var activeUser = pushUser || instanceUser
          var runnable = Runnable.createClient({}, activeUser)
          return Promise.fromCallback(function (callback) {
            log.trace('create and build a build')
            runnable.createAndBuildBuild(
              newContextVersion._id.toString(),
              instanceOwnerGithubId,
              triggeredActionName,
              pick(pushInfo, ['repo', 'branch', 'commit', 'commitLog']),
              callback
            )
          }).then(function (build) {
            return {
              user: activeUser,
              build: build,
              contextVersion: newContextVersion
            }
          })
        })
    })
}
