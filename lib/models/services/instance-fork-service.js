/**
 * Instance fork service to provide forks of instances!
 * @module lib/models/services/instance-fork-service
 */
'use strict'

const exists = require('101/exists')
const isObject = require('101/is-object')
const keypather = require('keypather')()
const monitorDog = require('monitor-dog')
const pluck = require('101/pluck')
const pick = require('101/pick')
const Promise = require('bluebird')

const Context = require('models/mongo/context')
const ContextVersionService = require('models/services/context-version-service')
const BuildService = require('models/services/build-service')
const Instance = require('models/mongo/instance')
const InstanceService = require('models/services/instance-service')
const logger = require('logger')

function InstanceForkService () {}

InstanceForkService.logger = logger.child({
  module: 'InstanceForkService'
})

module.exports = InstanceForkService

InstanceForkService.generateIsolatedName = function (masterInstanceShortHash, instanceName) {
  return masterInstanceShortHash + '--' + instanceName
}
InstanceForkService.generateBranchForkName = function (branch, instanceName) {
  return branch.replace(/[^a-zA-Z0-9]/g, '-') + '-' + instanceName
}

const FORKING_PROPS = [
  'aliases',
  'containerStartCommand',
  'env',
  'ipWhitelist',
  'isTesting',
  'isTestReporter',
  'owner',
  'ports',
  'shortName'
]

/**
 * Creates the opts to create a forked instance from the original, and a few overrides
 *
 * @param {Instance} instance                       - Parent Instance to fork from
 * @param {String}   instance.name                  - Name of the instance
 * @param {String}   instance.shortName             - ShortName which should be inherited
 * @param {String}   instance.shortHash             - ShortHash identifier of this instance
 * @param {Object[]} instance.aliases               - Connection Aliases, should be inherited
 * @param {String}   instance.containerStartCommand - Overridden container start command
 * @param {String[]} instance.env                   - Container Runtime Envs
 * @param {Object}   instance.ipWhitelist           - Model for blocking external http traffic
 * @param {Boolean=} instance.isTesting             - If this instance is part of a testing cluster
 * @param {Boolean=} instance.isTestReporter        - If this instance reports test results
 * @param {Object}   instance.owner                 - Owner info
 * @param {Object[]} instance.ports                 - Ports to keep open
 * @param {Object}   opts                           - New options for this new instance
 * @param {Boolean=} opts.autoForked                - True if the new instance was forked
 * @param {String=}  opts.branch                    - Branch name (if this is for a branch)
 * @param {String}   opts.buildId                   - New build Id for this new instance
 * @param {String=}  opts.isolated                  - Isolation Object ID
 * @param {String=}  opts.masterInstanceShortHash   - ShortHash of the isolation master
 *
 * @returns {Object} Body - New body opts for the instance
 */
InstanceForkService.createForkedInstanceBody = function (instance, opts) {
  const defaultBody = {
    build: opts.buildId,
    parent: instance.shortHash,
    shortName: instance.shortName || instance.name,
    masterPod: false
  }
  if (opts.autoForked) {
    defaultBody.autoForked = opts.autoForked
  }
  if (opts.isolated) {
    defaultBody.isolated = opts.isolated
    // isIsolationGroupMaster should only exist on instances that are isolated.  If
    // it exists on a non-isolated instance, the UI (and this api) will break
    defaultBody.isIsolationGroupMaster = false
    defaultBody.name = InstanceForkService.generateIsolatedName(opts.masterInstanceShortHash, instance.name)
  } else if (opts.branch) {
    defaultBody.name = InstanceForkService.generateBranchForkName(opts.branch, instance.name)
  }

  return Object.assign(pick(instance, FORKING_PROPS), defaultBody)
}
/**
 * Fork a repository instance. This is geared for knowing who is forking the
 * instance (session user), but is similar to InstanceForkService._forkOne.
 * @param {object} instance Instance which to fork.
 * @param {object} opts Various opts for the new instance.
 * @param {string} opts.repo Repository in which to fork (e.g. "Runnable/cli").
 * @param {string} opts.branch Branch to fork.
 * @param {string} opts.commit Commit to set forked Instance.
 * @param {object} opts.user Little user information object.
 * @param {string} opts.user.id Github ID of the user creating the new Instance.
 * @param {string} pushInfo.isolated Isolation ID to add to Instance.
 * @param {object} sessionUser Session User Object who is doing the forking.
 * @return {Promise} Resolves with a new Instance.
 */
InstanceForkService.forkRepoInstance = Promise.method(function (instance, opts, sessionUser) {
  const log = InstanceForkService.logger.child({
    method: 'forkRepoInstance',
    instanceId: keypather.get(instance, '_id'),
    opts,
    sessionUser
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
  ;[ 'repo', 'branch', 'commit', 'user.id', 'isolated' ].forEach(function (key) {
    if (!exists(keypather.get(opts, key))) {
      throw new Error('forkRepoInstance opts.' + key + ' is required')
    }
  })

  const sessionUserGithubId = keypather.get(sessionUser, 'accounts.github.id')

  const fakePushInfo = {
    repo: opts.repo,
    branch: opts.branch,
    commit: opts.commit,
    user: {
      id: sessionUserGithubId
    }
  }
  return BuildService.createAndBuildContextVersion(instance, fakePushInfo, 'isolate')
    .then(function (resultModel) {
      opts.buildId = resultModel.build._id.toString()
      const body = InstanceForkService.createForkedInstanceBody(instance, opts)
      log.trace({ body }, 'creating a new instance')
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
  const log = InstanceForkService.logger.child({
    instanceId: keypather.get(masterInst, '_id.toString()'),
    buildId,
    method: 'forkMasterInstance'
  })
  log.trace('InstanceForkService.forkMasterInstance called')
  // basically only letters, numbers and - are allowed in domain names
  const opts = {
    buildId,
    branch,
    autoForked: true
  }
  const body = InstanceForkService.createForkedInstanceBody(masterInst, opts)
  const tags = [
    'env:' + process.env.NODE_ENV
  ]
  log.trace({ body }, 'Creating instance')
  return InstanceService.createInstance(body, sessionUser)
    .tap(function () {
      // Since we've created an instance we now have added branches, set the flag on the master.
      return InstanceService.updateInstance(masterInst, { hasAddedBranches: true }, sessionUser)
    })
    .tap(function (instance) {
      log.info({
        forkedInstanceId: instance._id.toString()
      }, 'forkMasterInstance success')
      monitorDog.increment('api.runnable.fork_master_instance.success', 1, tags)
    })
    .catch(function (err) {
      log.error({ err }, 'forkMasterInstance failure')
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
    pushInfo
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
      log.error({ err }, 'error while forking an instance')
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
      return ContextVersionService.handleVersionDeepCopy(
        context,
        contextVersion,
        user,
        opts
      )
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
      const buildId = newBuild._id
      log.trace({ buildId }, 'building our new build')
      return BuildService.buildBuild(buildId, { message: 'Initial Isolation Build' }, sessionUser)
    })
    .then(function (newBuild) {
      // name here is defined with a `--` because we are looking to get a
      // unique name that we can parse easially. `--` is our seperator for
      // the master instance's short hash before the name of the instance
      // we are forking into isolation.
      const opts = {
        autoForked: true,
        buildId: newBuild._id.toString(),
        isolated: isolationId.toString(),
        masterInstanceShortHash: masterInstanceShortHash
      }
      const body = InstanceForkService.createForkedInstanceBody(instance, opts)
      log.trace({ body }, 'creating a new instance')
      return InstanceService.createInstance(body, sessionUser)
    })
    .then(function (instance) {
      log.trace('finding the instance in the database')
      return Instance.findByIdAsync(instance._id)
    })
    .catch(function (err) {
      log.error({ err }, 'errored while forking non-repository instance')
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
  const log = InstanceForkService.logger.child({
    method: 'autoFork',
    pushInfo
  })
  log.info('instances')
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
