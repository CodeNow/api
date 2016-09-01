/**
 * Instance fork service to provide forks of instances!
 * @module lib/models/services/instance-fork-service
 */
'use strict'

var exists = require('101/exists')
var isObject = require('101/is-object')
var keypather = require('keypather')()
var monitorDog = require('monitor-dog')
var pluck = require('101/pluck')
var Promise = require('bluebird')

var Context = require('models/mongo/context')
var ContextService = require('models/services/context-service')
var BuildService = require('models/services/build-service')
var Instance = require('models/mongo/instance')
var InstanceService = require('models/services/instance-service')
var logger = require('logger')

function InstanceForkService () {}

InstanceForkService.logger = logger.child({
  module: 'InstanceForkService'
})

module.exports = InstanceForkService

/**
 * Fork a repository instance. This is geared for knowing who is forking the
 * instance (session user), but is similar to InstanceForkService._forkOne.
 * @param {object} instance Instance which to fork.
 * @param {object} opts Various opts for the new instance.
 * @param {string} opts.repo Repository in which to fork (e.g. "Runnable/cli").
 * @param {string} opts.branch Branch to fork.
 * @param {string} opts.commit Commit to set forked Instance.
 * @param {object} opts.name Name of instance to be created
 * @param {object} opts.user Little user information object.
 * @param {string} opts.user.id Github ID of the user creating the new Instance.
 * @param {string} (Optional) pushInfo.isolated Isolation ID to add to Instance.
 * @param {object} sessionUser Session User Object who is doing the forking.
 * @return {Promise} Resolves with a new Instance.
 */
InstanceForkService.forkRepoInstance = Promise.method(function (instance, opts, sessionUser) {
  var log = InstanceForkService.logger.child({
    method: 'forkRepoInstance',
    instanceId: keypather.get(instance, '_id'),
    opts: opts,
    sessionUser: sessionUser
  })
  log.info('forking a repository instance')
  if (!exists(instance)) {
    throw new Error('forkRepoInstance instance is required')
  }
  if (!exists(opts)) {
    throw new Error('forkRepoInstance opts are required')
  }
  if (!exists(sessionUser)) {
    throw new Error('forkRepoInstance sessionUser is required')
  }

  // required values on opts
  ;[ 'repo', 'branch', 'commit', 'user.id', 'name' ].forEach(function (key) {
    if (!exists(keypather.get(opts, key))) {
      throw new Error('forkRepoInstance opts.' + key + ' is required')
    }
  })

  var sessionUserGithubId = keypather.get(sessionUser, 'accounts.github.id')

  var fakePushInfo = {
    repo: opts.repo,
    branch: opts.branch,
    commit: opts.commit,
    user: {
      id: sessionUserGithubId
    }
  }
  return BuildService.createAndBuildContextVersion(instance, fakePushInfo, 'isolate')
    .then(function (resultModel) {
      var newBuild = resultModel.build
      var body = {
        build: newBuild._id.toString(),
        name: opts.name,
        env: opts.env,
        owner: { github: instance.owner.github },
        masterPod: false,
        isolated: opts.isolated,
        isIsolationGroupMaster: opts.isIsolationGroupMaster
      }
      log.trace({ body: body }, 'creating a new instance')
      return InstanceService.createInstance(body, sessionUser)
    })
})

/**
 * Creates a new instance based on a given MASTERINST, and will be based off the BRANCH.  It's name
 * will be modified to include the branch name, then the given BUILD is attached, then the instance
 * is created
 * @param masterInst  {Instance} masterpod instance to fork this new instance from
 * @param buildId     {String}   build id of the build to attach to this new instance {ObjectId}
 * @param branch      {String}   branch name from GitHub
 * @param sessionUser {User}     sessionUser User model from the session
 * @returns {Promise} when the instance has been created
 * @resolves {Instance} newly created child instance
 * @throws Errors from InstanceService.createInstance
 */
InstanceForkService.forkMasterInstance = function (masterInst, buildId, branch, sessionUser) {
  var log = InstanceForkService.logger.child({
    instanceId: keypather.get(masterInst, '_id.toString()'),
    buildId: buildId,
    method: 'forkMasterInstance'
  })
  log.trace('InstanceForkService.forkMasterInstance called')
  // basically only letters, numbers and - are allowed in domain names
  var sanitizedBranch = branch.replace(/[^a-zA-Z0-9]/g, '-')
  var body = {
    parent: masterInst.shortHash,
    build: buildId,
    name: sanitizedBranch + '-' + masterInst.name,
    env: masterInst.env,
    owner: {
      github: masterInst.owner.github
    },
    masterPod: false,
    autoForked: true,
    isTesting: masterInst.isTesting
  }
  var tags = [
    'env:' + process.env.NODE_ENV
  ]
  log.trace({
    body: body
  }, 'Creating instance')
  return InstanceService.createInstance(body, sessionUser)
    .tap(function (instance) {
      log.info({
        forkedInstanceId: instance._id.toString()
      }, 'forkMasterInstance success')
      monitorDog.increment('api.runnable.fork_master_instance.success', 1, tags)
    })
    .catch(function (err) {
      log.error({err: err}, 'forkMasterInstance failure')
      monitorDog.increment('api.runnable.fork_master_instance.error', 1, tags)
      throw err
    })
}
/**
 * Instance forking functionality. We do the following things:
 * 1 - Create a new Context Version
 * 2 - Create a new Build (and build it)
 * 3 - Fork the master Instance with the new Build
 * @private
 * @param {Instance} instance Instance to Fork.
 * @param {Object} pushInfo GitHub push information.
 * @param {String} pushInfo.repo GitHub Repository.
 * @param {String} pushInfo.branch GitHub Branch.
 * @param {String} pushInfo.commit GitHub Commit.
 * @param {Object} pushInfo.user GitHub User object.
 * @param {Number} pushInfo.user.id GitHub User ID.
 * @returns {Promise}
 * @resolves with forkedInstance
 */
InstanceForkService._forkOne = function (instance, pushInfo) {
  var log = InstanceForkService.logger.child({
    method: '_forkOne',
    instanceId: keypather.get(instance, '_id'),
    pushInfo: pushInfo
  })
  log.info('forking an instance')
  monitorDog.increment('api.instance-fork-service.fork-one')
  return BuildService.createAndBuildContextVersion(instance, pushInfo, 'autolaunch')
    .then(function (result) {
      log.trace('fork master instance')
      var newBuild = result.build
      var user = result.user
      return InstanceForkService.forkMasterInstance(
        instance,
        newBuild._id.toString(),
        pushInfo.branch,
        user
      )
    })
    .tap(function (instance) {
      log.trace({
        forkedInstanceId: keypather.get(instance, '_id')
      }, 'fork master instance')
    })
    .catch(function (err) {
      log.error({ err: err }, 'error while forking an instance')
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
  var log = InstanceForkService.logger.child({
    method: '_createNewNonRepoContextVersion',
    contextVersionId: keypather.get(contextVersion, '_id'),
    ownerId: ownerId,
    createdById: createdById
  })
  log.info('creating a new non-repository context version')
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
      log.error({ err: err }, 'errored while creating a non-repo context version')
      throw err
    })
}

/**
 * Fork a non-repo Instance (container). This is seperate logic because it does
 * not require repository information. This is tailored to work w/ Isolation -
 * it requires an Isolation ID. This could be removed in the future.
 * @param {Object} instance Instance to fork.
 * @param {String} masterInstanceShortHash Short Hash of master Instance.
 * @param {String} isolationId ID of the Isolation to add to the Instance. {ObjectId}
 * @param {Object} sessionUser Session User with which to create the models.
 * @returns {Promise} Resolves with the new Instance.
 */
InstanceForkService.forkNonRepoInstance = function (instance, masterInstanceShortHash, isolationId, sessionUser) {
  var log = InstanceForkService.logger.child({
    method: 'forkNonRepoChild',
    instanceId: keypather.get(instance, '_id'),
    masterInstanceShortHash: masterInstanceShortHash,
    isolationId: isolationId,
    sessionUserUsername: keypather.get(sessionUser, 'accounts.github.username')
  })
  log.info('forking a non-repository instance')
  monitorDog.increment('api.instance-fork-service.fork-non-repo-instance')
  var instanceOwnerId = keypather.get(instance, 'owner.github')
  var createdById = keypather.get(sessionUser, 'accounts.github.id')
  return Promise
    .try(function () {
      var error = null
      if (!instance) {
        error = new Error('forkNonRepoInstance instance is required')
      } else if (!instance.contextVersion) {
        error = new Error('forkNonRepoInstance instance.contextVersion is required')
      } else if (!instanceOwnerId) {
        error = new Error('forkNonRepoInstance instance.owner.github is required')
      } else if (!masterInstanceShortHash) {
        error = new Error('forkNonRepoInstance masterInstanceShortHash is required')
      } else if (!isolationId) {
        error = new Error('forkNonRepoInstance isolationId is required')
      } else if (!sessionUser) {
        error = new Error('forkNonRepoInstance sessionUser is required')
      } else if (!createdById) {
        error = new Error('forkNonRepoInstance sessionUser.accounts.github.id is required')
      }
      if (error) {
        error.data = {
          instanceId: keypather.get(instance, '_id'),
          masterInstanceShortHash: masterInstanceShortHash,
          isolationId: isolationId,
          sessionUserUsername: keypather.get(sessionUser, 'accounts.github.username')
        }
        throw error
      }
    })
    .then(function () {
      log.trace('calling _createNewNonRepoContextVersion')
      return InstanceForkService._createNewNonRepoContextVersion(
        instance.contextVersion,
        instanceOwnerId,
        createdById
      )
    })
    .then(function (newContextVersion) {
      var newBuildPayload = {
        contextVersions: [newContextVersion._id.toString()],
        owner: {github: instanceOwnerId}
      }
      log.trace({ body: newBuildPayload }, 'calling createBuild')
      return BuildService.createBuild(newBuildPayload, sessionUser)
    })
    .then(function (newBuild) {
      log.trace({
        buildId: newBuild._id
      }, 'building our new build')
      return BuildService.buildBuild(newBuild._id, { message: 'Initial Isolation Build' }, sessionUser, process.domain)
    })
    .then(function (newBuild) {
      // name here is defined with a `--` because we are looking to get a
      // unique name that we can parse easially. `--` is our seperator for
      // the master instance's short hash before the name of the instance
      // we are forking into isolation.
      var body = {
        build: newBuild._id.toString(),
        name: masterInstanceShortHash + '--' + instance.name,
        env: instance.env,
        owner: { github: instanceOwnerId },
        masterPod: false,
        isolated: isolationId.toString(),
        isIsolationGroupMaster: false
      }
      log.trace({ body: body }, 'creating a new instance')
      return InstanceService.createInstance(body, sessionUser)
    })
    .then(function (instance) {
      log.trace('finding the instance in the database')
      return Instance.findByIdAsync(instance._id)
    })
    .catch(function (err) {
      log.error({ err: err }, 'errored while forking non-repository instance')
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
 * @param {Number} pushInfo.user.id GitHub User ID.
 * @returns {Promise} Resolved with an array of new Instances.
 */
InstanceForkService.autoFork = function (instances, pushInfo) {
  var log = InstanceForkService.logger.child({
    method: 'autoFork',
    pushInfo: pushInfo
  })
  log.info('autoforking instances')
  monitorDog.increment('api.instance-fork-service.auto-fork')
  var timer = monitorDog.timer('api.instance-fork-service.auto-fork.timer')
  return Promise.try(function () {
    if (!Array.isArray(instances)) {
      throw new Error('autoFork requires instances to be an array')
    }
    log.trace({ instanceIds: instances.map(pluck('_id')) }, 'forking these instances')
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
      .filter(exists)
    })
    .catch(function (err) {
      log.error({ err: err }, 'errored during autofork')
      throw err
    })
    .finally(function () {
      timer.stop()
    })
}
