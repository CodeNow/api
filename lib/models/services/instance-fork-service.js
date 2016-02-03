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
var User = require('models/mongo/user')
var assign = require('101/assign')
var isObject = require('101/is-object')
var keypather = require('keypather')()
var log = require('middlewares/logger')(__filename).log
var monitorDog = require('monitor-dog')
var pluck = require('101/pluck')

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
  var logData = {
    tx: true,
    pushInfo: pushInfo,
    funcName: funcName
  }
  log.info(logData, 'InstanceForkService._validatePushInfo')
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
      log.error(assign({ err: err }, logData), 'InstanceForkService._createNewContextVersion error')
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
 * @param {String} pushInfo.user.id GitHub User ID.
 * @returns {Promise} Resolved with new Context Version.
 */
InstanceForkService._createNewContextVersion = function (instance, pushInfo) {
  var logData = {
    tx: true,
    instanceId: keypather.get(instance, '_id'),
    pushInfo: pushInfo
  }
  log.info(logData, 'InstanceForkService._createNewContextVersion')
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
      return ContextVersion.modifyAppCodeVersionByRepoAsync(
        newContextVersion._id.toString(),
        pushInfo.repo,
        pushInfo.branch,
        pushInfo.commit
      )
    })
    .catch(function (err) {
      log.error(assign({ err: err }, logData), 'InstanceForkService._createNewContextVersion error')
      throw err
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
  var logData = {
    tx: true,
    instanceId: keypather.get(instance, '_id'),
    pushInfo: pushInfo
  }
  log.info(logData, 'InstanceForkService._notifyExternalServices')
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
    .catch(function (err) {
      log.error(assign({ err: err }, logData), 'InstanceForkService._notifyExternalServices error')
      throw err
    })
}

/**
 * Instance forking functionality. We do the following things:
 * 1 - Create a new Context Version
 * 2 - Create a new Build (and build it)
 * 3 - Fork the master Instance with the new Build
 * 4 - Notify external services about the new Instance
 * @private
 * @param {Object} instance Instance to Fork.
 * @param {Object} pushInfo GitHub push information.
 * @param {String} pushInfo.repo GitHub Repository.
 * @param {String} pushInfo.branch GitHub Branch.
 * @param {String} pushInfo.commit GitHub Commit.
 * @param {Object} pushInfo.user GitHub User object.
 * @param {String} pushInfo.user.id GitHub User ID.
 * @returns {Promise} Resolved with new Instance.
 */
InstanceForkService._forkOne = function (instance, pushInfo) {
  var logData = {
    tx: true,
    instanceId: keypather.get(instance, '_id'),
    pushInfo: pushInfo
  }
  log.info(logData, 'InstanceForkService._forkOne')
  monitorDog.increment('api.instance-fork-service.fork-one')
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
        // instanceUser is the owner of the instance.
        instanceUser: User.findByGithubIdAsync(instanceUserGithubId),
        // pushUser is the user who pushed to GitHub (if we have the user in
        // our database).
        pushUser: User.findByGithubIdAsync(pushInfo.user.id)
      })
    })
    .then(function (result) {
      var instanceUser = result.instanceUser
      var pushUser = result.pushUser
      // 1. create a new context version.
      return InstanceForkService._createNewContextVersion(instance, pushInfo)
        // 2. create new build and build it.
        .then(function (newContextVersion) {
          // the instanceUser needs to create the build (it's someone who is
          // known to be in our system).
          var runnable = Runnable.createClient({}, instanceUser)
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
        // 3. fork master instance with new build.
        .then(function (newBuild) {
          return Promise.fromCallback(function (callback) {
            // If we have the pushUser (the user who committed the code to
            // GitHub), we can create the new Instance (for the new branch) with
            // that user (so the correct user owns it).
            var runnable = Runnable.createClient({}, pushUser || instanceUser)
            runnable.forkMasterInstance(
              instance,
              newBuild._id.toString(),
              pushInfo.branch,
              callback
            )
          })
          // Errors from the above promise will be thrown and cause the
          // notifications below to not be invoked (desired).
        })
        // 4. notify any external services about the new update.
        .then(function (forkedInstance) {
          var tokenLocation = 'accounts.github.accessToken'
          var accessToken = keypather.get(pushUser, tokenLocation) ||
            keypather.get(instanceUser, tokenLocation)
          return InstanceForkService._notifyExternalServices({
            instance: forkedInstance,
            accessToken: accessToken,
            pushInfo: pushInfo
          })
            .return(forkedInstance)
        })
    })
    .catch(function (err) {
      log.error(assign({ err: err }, logData), 'InstanceForkService._forkOne error')
      throw err
    })
}

/**
 * Create a new Context and ContextVersion for a given Context Version. This is
 * basically a deep copy for a non-repo Context Version. It ensures that the
 * advanced flag is also set on the new Context Version.
 * @param {Object} contextVersion Context Version model to deep copy.
 * @param {String} ownerId Github ID to own the newly created models.
 * @param {String} createdById Github ID to be marked as the creator of the
 *   models.
 * @returns {Promise} Resovled with a new, updated Context Version (new Context
 *   ID is at newContextVersion.context).
 */
InstanceForkService._createNewNonRepoContextVersion = function (contextVersion, ownerId, createdById) {
  var logData = {
    tx: true,
    contextVersionId: keypather.get(contextVersion, '_id'),
    ownerId: ownerId,
    createdById: createdById
  }
  log.info(logData, 'InstanceForkService._createNewNonRepoContextVersion')
  var contextId = keypather.get(contextVersion, 'context')
  return Promise.try(function () {
    if (!contextVersion) {
      throw new Error('_createNewNonRepoContextVersion requires an contextVersion')
    }
    if (!contextId) {
      throw new Error('_createNewNonRepoContextVersion requires an contextVersion.context')
    }
    if (!ownerId) {
      throw new Error('_createNewNonRepoContextVersion requires an ownerId')
    }
    if (!createdById) {
      throw new Error('_createNewNonRepoContextVersion requires an createdById')
    }
  })
    .then(function () {
      return Promise.fromCallback(
        Context.findOne.bind(Context, { _id: contextId })
      )
    })
    .then(function (context) {
      var user = { accounts: { github: { id: createdById } } }
      var opts = { owner: { github: ownerId } }
      return Promise.fromCallback(function (callback) {
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
      // non-repo context versions _must_ have advanced: true set.
      var update = {
        $set: { advanced: true }
      }
      return Promise.fromCallback(function (callback) {
        newContextVersion.update(update, callback)
      })
    })
    .catch(function (err) {
      log.error(assign({ err: err }, logData), 'InstanceForkService._createNewNonRepoContextVersion error')
      throw err
    })
}

/**
 * Fork a non-repo Instance (container). This is seperate logic because it does
 * not require repository information. This is tailored to work w/ Isolation -
 * it requires an Isolation ID. This could be removed in the future.
 * @param {Object} instance Instance to fork.
 * @param {String} masterInstanceShortHash Short Hash of master Instance.
 * @param {ObjectId} isolationId ID of the Isolation to add to the Instance.
 * @param {Object} sessionUser Session User with which to create the models.
 * @returns {Promise} Resolves with the new Instance.
 */
InstanceForkService.forkNonRepoInstance = function (instance, masterInstanceShortHash, isolationId, sessionUser) {
  var logData = {
    tx: true,
    instanceId: keypather.get(instance, '_id'),
    masterInstanceShortHash: masterInstanceShortHash,
    isolationId: isolationId,
    sessionUserUsername: keypather.get(sessionUser, 'accounts.github.username')
  }
  log.info(logData, 'InstanceForkService.forkNonRepoInstance')
  monitorDog.increment('api.instance-fork-service.fork-non-repo-instance')
  var instanceOwnerId = keypather.get(instance, 'owner.github')
  var createdById = keypather.get(sessionUser, 'accounts.github.id')
  return Promise.try(function () {
    if (!instance) {
      throw new Error('forkNonRepoInstance instance is required')
    }
    if (!instance.contextVersion) {
      throw new Error('forkNonRepoInstance instance.contextVersion is required')
    }
    if (!instanceOwnerId) {
      throw new Error('forkNonRepoInstance instance.owner.github is required')
    }
    if (!masterInstanceShortHash) {
      throw new Error('forkNonRepoInstance masterInstanceShortHash is required')
    }
    if (!isolationId) {
      throw new Error('forkNonRepoInstance isolationId is required')
    }
    if (!sessionUser) {
      throw new Error('forkNonRepoInstance sessionUser is required')
    }
    if (!createdById) {
      throw new Error('forkNonRepoInstance sessionUser.accounts.github.id is required')
    }
  })
    .then(function () {
      return InstanceForkService._createNewNonRepoContextVersion(
        instance.contextVersion,
        instanceOwnerId,
        createdById
      )
    })
    .then(function (newContextVersion) {
      // Create a build, build it, create a new instance with the new build.
      // Since these are all w/ the runnable client, I'm keeping the chain here
      // (since we've guarenteed `sessionUser` exists at this point).
      var runnable = Runnable.createClient({}, sessionUser)
      return Promise.fromCallback(function (callback) {
        var newBuildPayload = {
          contextVersions: [ newContextVersion._id.toString() ],
          owner: { github: instanceOwnerId }
        }
        runnable.createBuild({ json: newBuildPayload }, callback)
      })
        .then(function (newBuild) {
          return Promise.fromCallback(function (callback) {
            var buildBuildPayload = { message: 'Initial Isolation Build' }
            runnable.buildBuild(newBuild, { json: buildBuildPayload }, callback)
          })
        })
        .then(function (newBuild) {
          return Promise.fromCallback(function (callback) {
            // name here is defined with a `--` because we are looking to get a
            // unique name that we can parse easially. `--` is our seperator for
            // the master instance's short hash before the name of the instance
            // we are forking into isolation.
            var body = {
              build: newBuild._id.toString(),
              name: masterInstanceShortHash + '--' + instance.name,
              env: instance.env,
              owner: { github: instanceOwnerId },
              masterPod: true,
              isolated: isolationId.toString(),
              isIsolationGroupMaster: false
            }
            runnable.createInstance(body, callback)
          })
        })
    })
    .catch(function (err) {
      log.error(assign({ err: err }, logData), 'InstanceForkService.forkNonRepoInstance error')
      throw err
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
 * @returns {Promise} Resolved with an array of new Instances.
 */
InstanceForkService.autoFork = function (instances, pushInfo) {
  var logData = {
    tx: true,
    pushInfo: pushInfo
  }
  log.info(logData, 'InstanceForkService.autoFork')
  monitorDog.increment('api.instance-fork-service.auto-fork')
  var timer = monitorDog.timer('api.instance-fork-service.auto-fork.timer')
  return Promise.try(function () {
    if (!Array.isArray(instances)) {
      throw new Error('autoFork requires instances to be an array')
    }
    assign(logData, { instanceIds: instances.map(pluck('_id')) })
    log.trace(logData, 'InstanceForkService.autoFork instanceIds')
    if (!isObject(pushInfo)) {
      throw new Error('autoFork requires pushInfo to be provided')
    }
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
    .catch(function (err) {
      log.error(assign({ err: err }, logData), 'InstanceForkService.autoFork error')
      throw err
    })
    .finally(function () {
      timer.stop()
    })
}
