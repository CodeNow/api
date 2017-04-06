/**
 * Instance represents a docker container mapped with user data
 * @module lib/models/mongo/instance
 */
'use strict'
const async = require('async')
const BaseSchema = require('models/mongo/schemas/base')
const Boom = require('dat-middleware').Boom
const clone = require('101/clone')
const escapeRegExp = require('regexp-quote')
const exists = require('101/exists')
const find = require('101/find')
const hasKeypaths = require('101/has-keypaths')

const isFunction = require('101/is-function')
const isObject = require('101/is-object')
const keypather = require('keypather')()
const mongoose = require('mongoose')
const objectId = require('objectid')
const pick = require('101/pick')
const pluck = require('101/pluck')
const Promise = require('bluebird')
const runnableHostname = require('@runnable/hostname')
const Subtract = require('array-subtract')

const ContextVersion = require('models/mongo/context-version')
const error = require('error')
const formatObjectForMongo = require('utils/format-object-for-mongo')
const InstanceSchema = require('models/mongo/schemas/instance')
const logger = require('middlewares/logger')(__filename)
const pubsub = require('models/redis/pubsub')
const toJSON = require('utils/to-json')
const User = require('models/mongo/user')
const utils = require('middlewares/utils')

var Instance
const ownerCreatedByKeypaths = ['owner.username', 'owner.gravatar', 'createdBy.username', 'createdBy.gravatar']

InstanceSchema.set('toJSON', { virtuals: true })

const optsThatShouldPreventAddingDefaultIsolationOpts = [
  'lowerName',  // if we are querying by lowerName, don't add anything
  'isolated', // if isolated or isIsolationGroupMaster is set, don't add anything
  'isIsolationGroupMaster',
  'container.dockerHost',
  'container.inspect.NetworkSettings.IPAddress',
  'network.hostIp'
]

/**
 * Helper function to add default query parameters associated with Isolation.
 * It places parameters in .$or if .isolated or .isIsolationGroupMaster
 * isn't set.
 * @param {object} query MongoDB query Object.
 * @returns {object} Query Object w/ default isolation options.
 */
InstanceSchema.statics.addDefaultIsolationOpts = function (query) {
  var log = logger.log.child({
    query: query,
    method: 'InstanceSchema.statics.addDefaultIsolationOpts'
  })
  log.info('called')
  if (isObject(query)) {
    query = clone(query)
  } else {
    query = {}
  }
  var defaultOpts = {
    $or: [
      { isolated: { $exists: false } },
      { isIsolationGroupMaster: true }
    ]
  }
  function existsInQuery (optKey) {
    return exists(query[optKey])
  }
  if (optsThatShouldPreventAddingDefaultIsolationOpts.some(existsInQuery)) {
    return query
  }
  if (query.$or) {
    // $or is, by definition, an array, so no need to check
    query.$or = query.$or.concat(defaultOpts.$or)
  } else {
    query.$or = defaultOpts.$or
  }
  return query
}

InstanceSchema.statics.findOneByShortHash = function (shortHash, cb) {
  var log = logger.log.child({
    shortHash: shortHash,
    isObjectId: utils.isObjectId(shortHash),
    method: 'InstanceSchema.statics.findOneByShortHash'
  })
  log.info('called')
  if (utils.isObjectId(shortHash)) {
    return this.findById(shortHash, cb)
  }
  this.findOne({
    shortHash: shortHash
  }, function (err) {
    if (err) {
      log.error({ err: err }, 'findOne error')
    } else {
      log.trace('findOne success')
    }
    cb.apply(this, arguments)
  })
}

/**
 * Given a shortHash, return an instanceId
 *
 * @param {String} shortHash
 *
 * @resolves {ObjectId} instanceId
 * @throws {Instance.NotFoundError} If instance wasn't found
 */
InstanceSchema.statics.findInstanceIdByShortHash = function (shortHash) {
  const log = logger.log.child({
    shortHash,
    method: 'InstanceSchema.statics.findInstanceIdByShortHash'
  })
  log.info('called')
  return Instance.findOneByShortHashAsync(shortHash)
    .tap(instance => {
      if (!instance) {
        throw new Instance.NotFoundError({ shortHash })
      }
    })
    .get('_id')
}

/**
 * Given an array of instances, fetch all of the parent instance ids
 *
 * @param {Instance[]} instances
 *
 * @resolves {ObjectId} instanceId
 * @throws {Instance.NotFoundError} If instance wasn't found
 */
InstanceSchema.statics.fetchParentInstances = function (instances) {
  const log = logger.log.child({
    method: 'InstanceSchema.statics.fetchParentInstances'
  })
  const contextIds = instances.map(pluck('contextVersion.context'))
  log.info({ contextIds }, 'called')

  return Instance.findAsync({
    'contextVersion.context': {
      $in: contextIds
    },
    masterPod: true
  })
    .tap(instances => {
      if (!instances) {
        throw new Instance.NotFoundError({ contextIds })
      }
    })
}

InstanceSchema.statics.findOneByContainerId = function (containerId, cb) {
  var log = logger.log.child({
    containerId: containerId,
    method: 'InstanceSchema.statics.findOneByContainerId'
  })
  log.info('called')
  this.findOne({
    'container.dockerContainer': containerId
  }, cb)
}

InstanceSchema.statics.findOneByContainerIdOrBuildContainerId = function (containerId) {
  const query = {
    $or: [
      { 'contextVersion.build.dockerContainer': containerId },
      { 'container.dockerContainer': containerId }
    ]
  }
  var log = logger.log.child({
    containerId,
    query,
    method: 'InstanceSchema.statics.findOneByContainerIdOrBuildContainerId'
  })
  log.info('called')
  return Instance.findOneAsync(query)
}

/**
 * Finds all instances with a contextVersion with this contextVersion.build.id
 * @param contextVersionBuildId Id of the contextVersion's build value
 * @returns  {Promise} Resolves when instances have been found
 * @resolves {[Instances]} Instances that contain a contextVersion matching the contextVersionBuildId
 */
InstanceSchema.statics.findByContextVersionBuildId = function (contextVersionBuildId) {
  var log = logger.log.child({
    contextVersionBuildId: contextVersionBuildId,
    method: 'InstanceSchema.statics.findByContextVersionBuildId'
  })
  var query = {
    $or: [
      { 'contextVersion.build._id': objectId(contextVersionBuildId) },
      { 'contextVersion.build._id': contextVersionBuildId }
    ]
  }
  log.trace({ query: query }, 'called')
  return Instance.findAsync(query)
}

InstanceSchema.statics.findByBuild = function (build /* , args */) {
  var log = logger.log.child({
    build: build,
    method: 'InstanceSchema.statics.findByBuild'
  })
  log.info('called')
  var args = Array.prototype.slice.call(arguments, 1)
  args.unshift({ build: build._id })
  this.find.apply(this, args)
}

/**
 * finds all instances that are built but not stopped (stopping also) or crashed (based on dockerHost)
 * @param  {String}   dockerHost format: http://10.0.0.1:4242
 * @return {Promise}
 * @resolves with instances array
 */
InstanceSchema.statics.findInstancesBuiltByDockerHost = function (dockerHost) {
  const query = {
    'container.dockerHost': dockerHost,
    'contextVersion.build.completed': { $exists: true }
  }
  const log = logger.log.child({
    dockerHost,
    query,
    method: 'InstanceSchema.statics.findInstancesBuiltByDockerHost'
  })
  log.info('called')
  return Instance.findAsync(query)
}

/**
 * Find instances that are currently building on the dock.
 * Building on dock means:
 * - instance has no container
 * - contextVersion.dockerHost should match
 * - contextVersion.build.started should be set
 * - contextVersion.build.failed & contextVersion.build.completed should not exist
 */
InstanceSchema.statics.findInstancesBuildingOnDockerHost = function (dockerHost) {
  const query = {
    'container': {
      $exists: false
    },
    'contextVersion.dockerHost': dockerHost,
    'contextVersion.build.started': {
      $exists: true
    },
    'contextVersion.build.failed': {
      $exists: false
    },
    'contextVersion.build.completed': {
      $exists: false
    }
  }
  const log = logger.log.child({
    dockerHost,
    query,
    method: 'InstanceSchema.statics.findInstancesBuildingOnDockerHost'
  })
  log.info('called')
  return Instance.findAsync(query)
}

/**
 * verify instance is NOT starting or stopping
 * @returns {Promise}
 * @resolves {Object} instance
 * @throws [Boom.badRequest] If not state
 */
InstanceSchema.statics.assertNotStartingOrStopping = function (instance) {
  const State = keypather.get(instance, 'container.inspect.State')
  const log = logger.log.child({
    State: State,
    method: 'InstanceSchema.statics.assertNotStartingOrStopping'
  })
  log.trace('called')
  return Promise.try(function () {
    if (!State) {
      throw Boom.badRequest('Instance does not have a container')
    }
    if (State.Starting) {
      throw Boom.badRequest('Instance is already starting')
    }
    if (State.Stopping) {
      throw Boom.badRequest('Instance is already stopping')
    }
    return instance
  })
}

/**
 * Atomic set to starting
 * @param {function} cb Callback function
 */
InstanceSchema.methods.setContainerStateToStarting = function (cb) {
  const log = logger.log.child({
    instanceId: this._id,
    instanceName: this.name,
    dockerContainer: keypather.get(this, 'container.dockerContainer'),
    method: 'InstanceSchema.methods.setContainerStateToStarting'
  })
  log.info('called')

  var self = this
  var owner = this.owner
  var createdBy = this.createdBy

  Instance.findOneAndUpdate({
    _id: this._id,
    'container.dockerContainer': this.container.dockerContainer,
    'container.inspect.State.Starting': {
      $exists: false
    },
    'container.inspect.State.Stopping': {
      $exists: false
    }
  }, {
    $set: {
      'container.inspect.State.Starting': true
    }
  }, function (err, result) {
    if (err) {
      log.error({err: err}, 'fineOneAndUpdate error')
      return cb(err)
    }
    if (!result) {
      log.warn('fineOneAndUpdate !result')
      // Fetch instance to determine if it exists, or is starting or stopping
      Instance.findOne({
        _id: self._id,
        'container.dockerContainer': self.container.dockerContainer
      }, function (err, result2) {
        if (err) {
          log.error({err: err}, 'fineOneAndUpdate !result findOne error')
          return cb(err)
        } else if (!result2) {
          return cb(Boom.badRequest('instance container has changed'))
        }
        log.trace('fineOneAndUpdate !result findOne success')
        cb(null, result2)
      })
    } else {
      log.trace('fineOneAndUpdate success')
      // must preserve owner/createdBy if set via
      // populateOwnerAndCreatedBy
      result.owner = owner
      result.createdBy = createdBy
      return cb(null, result)
    }
  })
}

/**
 * Find instance that has speicified id, containerId and is in the `Stopping` state
 * @param {ObjectId} instanceId instance id
 * @param {String} containerId instance docker container id
 * @param {function} cb Callback function
 */
InstanceSchema.statics.findOneStopping = function (instanceId, containerId, cb) {
  var log = logger.log.child({
    instanceId: instanceId,
    dockerContainer: containerId,
    method: 'InstanceSchema.statics.findOneStopping'
  })
  log.info('called')
  Instance.findOne({
    _id: instanceId,
    'container.dockerContainer': containerId,
    'container.inspect.State.Stopping': true
  }, function (err, instance) {
    if (err) {
      log.error({err: err}, 'failed to find instance')
      return cb(err)
    }
    log.trace({
      containerState: keypather.get(instance, 'container.inspect.State')
    }, 'instance found')
    cb(null, instance)
  })
}

/**
 * Mark instance as `stopping` if it's not starting.
 * @param {ObjectId} instanceId instance id
 * @param {String} containerId instance docker container id
 * @param {function} cb Callback function
 */
InstanceSchema.statics.markAsStopping = function (instanceId, containerId, cb) {
  var log = logger.log.child({
    instanceId: instanceId,
    dockerContainer: containerId,
    method: 'InstanceSchema.statics.markAsStopping'
  })
  log.info('markAsStopping called')
  Instance.findOneAndUpdate({
    _id: instanceId,
    'container.dockerContainer': containerId,
    'container.inspect.State.Starting': {
      $exists: false
    }
  }, {
    $set: {
      'container.inspect.State.Stopping': true
    }
  }, function (err, instance) {
    if (err) {
      log.error({err: err}, 'failed to find/mark instance as stopping')
      return cb(err)
    }
    if (!instance) {
      var notFound = Boom.badRequest('Instance container has changed')
      log.trace('instance already changed state')
      return cb(notFound)
    }
    log.trace({
      containerState: keypather.get(instance, 'container.inspect.State')
    }, 'instance was updated')
    cb(null, instance)
  })
}

/**
 * Find instance that has specified id, containerId and is in the `Starting` state
 * @param {ObjectId} instanceId instance id
 * @param {String} containerId instance docker container id
 * @returns {Promise}
 * @resolves {Instance} when instance in starting state found
 * @throws {Instance.NotFoundError} If instance with containerId not found
 * @throws {Instance.IncorrectStateError} If instance not in starting state
 */
InstanceSchema.statics.findOneStarting = function (instanceId, containerId) {
  var query = {
    _id: instanceId,
    'container.dockerContainer': containerId
  }
  var log = logger.log.child({
    query: query,
    instanceId: instanceId,
    dockerContainer: containerId,
    method: 'InstanceSchema.statics.findOneStarting'
  })
  log.info('findOneStarting called')
  return Instance.findOneAsync(query)
    .tap(function checkInstanceState (instance) {
      if (!instance) {
        log.error({ query: query }, 'failed to find instance with container')
        throw new Instance.NotFoundError(query)
      }
      const status = keypather.get(instance, 'container.inspect.State.Status')
      if (status !== 'starting') {
        throw new Instance.IncorrectStateError('starting', status)
      }
    })
}

/**
 * @param {ObjectId} instanceId instance id
 * @param {ObjectId} contextVersionId
 * @param {String} containerId instance docker container id
 * @param {Object} containerInfo
 * @param {String} containerInfo.dockerContainer
 * @param {String} containerInfo.dockerHost
 * @param {Object} containerInfo.inspect
 * @param {Object} containerInfo.ports
 * @returns {Promise}
 * @resolves {Instance} when instance in starting state found
 * @throws {Instance.NotFoundError} If instance with containerId not found
 */
InstanceSchema.statics.markAsCreating = function (instanceId, contextVersionId, containerId, containerInfo) {
  const query = {
    _id: instanceId,
    'contextVersion.id': contextVersionId,
    $or: [
      { 'container.dockerContainer': containerId },
      { container: { $exists: false } }
    ]
  }

  const update = {
    $set: {
      container: containerInfo
    }
  }

  const log = logger.log.child({
    query,
    update,
    method: 'InstanceSchema.statics.markAsCreating'
  })
  log.info('markAsCreating called')

  // We don't want the base keys to be formatted because $set can take root-level dots
  Object.keys(update).forEach(function (key) {
    formatObjectForMongo(update[key])
  })

  return Instance.findOneAndUpdateAsync(query, update)
    .tap(function checkInstanceState (instance) {
      if (!instance) {
        log.error({ query }, 'failed to find instance with context version and not container')
        throw new Instance.NotFoundError(query)
      }
    })
}

/**
 * Mark instance as `starting` if it's not stopping.
 * @param {ObjectId} instanceId instance id
 * @param {String} containerId instance docker container id
 * @param {function} cb Callback function
 */
InstanceSchema.statics.markAsStarting = function (instanceId, containerId, cb) {
  var log = logger.log.child({
    instanceId: instanceId,
    dockerContainer: containerId,
    method: 'InstanceSchema.statics.markAsStarting'
  })
  // TODO: remove State.Starting set, update Stopping check to Status stopping
  log.info('markAsStarting called')
  Instance.findOneAndUpdate({
    _id: instanceId,
    'container.dockerContainer': containerId,
    'container.inspect.State.Stopping': {
      $exists: false
    }
  }, {
    $set: {
      'container.inspect.State.Starting': true,
      'container.inspect.State.Status': 'starting'
    }
  }, function (err, instance) {
    if (err) {
      log.error({err: err}, 'failed to find/mark instance as stopping')
      return cb(err)
    }
    if (!instance) {
      var notFound = Boom.badRequest('Instance container has changed')
      log.trace('instance already changed state')
      return cb(notFound)
    }
    log.trace({
      containerState: keypather.get(instance, 'container.inspect.State')
    }, 'instance was updated')
    cb(null, instance)
  })
}

/**
 * Fetch github user models for an instance owner
 * and instance createdBy user
 * @param {Object} sessionUser User Object
 * @param {Function} cb Callback function
 */
InstanceSchema.methods.populateOwnerAndCreatedBy = function (sessionUser, cb) {
  var log = logger.log.child({
    instanceId: this._id,
    shortHash: this.shortHash,
    instanceOwner: this.owner,
    instanceCreatedBy: this.createdBy,
    method: 'InstanceSchema.methods.populateOwnerAndCreatedBy'
  })
  log.info('called')
  if (isFunction(sessionUser)) {
    var err = new Error('populateOwnerAndCreatedBy called without user')
    err.level = 'critical'
    error.report(err)
    log.error({err: err}, 'called without user')
    return cb(err)
  }
  var self = this

  if (hasKeypaths(this, ownerCreatedByKeypaths)) {
    log.trace('success - already populated')
    return cb(null, self)
  }
  async.parallel({
    owner: sessionUser.findGithubUserByGithubId.bind(sessionUser, this.owner.github),
    createdBy: sessionUser.findGithubUserByGithubId.bind(sessionUser, this.createdBy.github)
  }, function (err, data) {
    if (err) {
      log.error({ err: err }, 'failure')
      return cb(err)
    }
    self.owner.username = keypather.get(data, 'owner.login')
    self.owner.gravatar = keypather.get(data, 'owner.avatar_url')
    self.createdBy.username = keypather.get(data, 'createdBy.login')
    self.createdBy.gravatar = keypather.get(data, 'createdBy.avatar_url')

    log.trace({
      data: toJSON(data)
    }, 'success')

    self.update({
      $set: {
        'owner.username': self.owner.username,
        'owner.gravatar': self.owner.gravatar,
        'createdBy.username': self.createdBy.username,
        'createdBy.gravatar': self.createdBy.gravatar
      }
    }, cb)
  })
}

InstanceSchema.statics.populateOwnerAndCreatedByForInstances = function (sessionUser, instances, cb) {
  var log = logger.log.child({
    sessionUser: sessionUser,
    instancesLength: instances.length,
    method: 'InstanceSchema.statics.populateOwnerAndCreatedByForInstances'
  })
  log.info('called')
  if (instances.length === 0) {
    done()
  } else {
    var instancesToPopulate = instances.filter(function (instance) {
      return !hasKeypaths(instance, ownerCreatedByKeypaths)
    })
    if (instancesToPopulate.length === 0) {
      log.trace('all instances populated already')
      return done()
    }
    var instancesByOwnerGithubId = groupBy(instancesToPopulate, 'owner.github')
    var ownerGithubIds = Object.keys(instancesByOwnerGithubId)
    var instancesByCreatedByGithubId = groupBy(instancesToPopulate, 'createdBy.github')
    var createdByGithubIds = Object.keys(instancesByCreatedByGithubId)
    async.waterfall([
      function checkIfSessionUserIsHelloRunnable (checkCallback) {
        if (sessionUser.accounts.github.id === process.env.HELLO_RUNNABLE_GITHUB_ID) {
          // just use the first created by - it defaults to previous users if the new user who
          // created the instance (i.e. pushed the branch) is _not_ in our db
          User.findByGithubId(createdByGithubIds[0], function (err, user) {
            if (err) {
              return checkCallback(err)
            } else if (!user) {
              // if we don't find a user, just don't fill it in
              // done gets us all the way out
              return done()
            }
            // else, continue and use the one we found
            checkCallback(null, user)
          })
        } else {
          checkCallback(null, sessionUser)
        }
      },
      function populateFields (user, populateCallback) {
        async.parallel([
          populateField.bind(null, user, ownerGithubIds, instancesByOwnerGithubId, 'owner'),
          populateField
            .bind(null, user, createdByGithubIds, instancesByCreatedByGithubId, 'createdBy')
        ], populateCallback)
      }
    ], done)
  }

  function populateField (searchUser, keyIds, mapToUpdateList, fieldPath, populateCallback) {
    async.each(keyIds.map(toInt), function (githubId, asyncCb) {
      searchUser.findGithubUserByGithubId(githubId, function (err, user) {
        var username = null
        var gravatar = null
        if (err) {
          // log error, and continue
          error.logIfErr(err)
        } else if (!user) {
          error.logIfErr(Boom.create(404, 'user was not found', {
            githubId: githubId,
            keyIds: keyIds,
            fieldPath: fieldPath,
            mapToUpdateList: mapToUpdateList
          }))
        } else {
          username = user.login
          gravatar = user.avatar_url
        }
        mapToUpdateList[githubId].forEach(function (instance) {
          keypather.set(instance, fieldPath + '.username', username)
          keypather.set(instance, fieldPath + '.gravatar', gravatar)

          // This doesn't need to be finished to return to the user and it's ran behind the scenes.
          // It won't have any adverse side effects so run it in parallel.
          var updateQuery = {}
          updateQuery[fieldPath + '.username'] = username
          updateQuery[fieldPath + '.gravatar'] = gravatar
          instance.update({
            $set: updateQuery
          }, function (err) {
            if (err) {
              log.error({
                err: err,
                instanceId: instance._id,
                updateQuery: updateQuery
              }, 'populateField')
            }
          })
        })
        asyncCb() // don't pass error
      })
    }, populateCallback)
  }

  function done (err) {
    cb(err, instances)
  }
}

// GRAPH RELATED FUNCTIONS

/**
 * get lowercase branch name of the contextVersion's main appCodeVersion
 * @param  {object} instance instance object to get main branch from
 * @return {string} branchName or null if no appCodeVersion
 */
InstanceSchema.statics.getMainBranchName = function (instance) {
  var log = logger.log.child({
    instance: instance,
    method: 'InstanceSchema.statics.getMainBranchName'
  })
  log.info('called')
  var appCodeVersions = keypather.get(instance, 'contextVersion.appCodeVersions')
  if (!appCodeVersions || appCodeVersions.length <= 0) {
    return null
  }
  var mainAppCodeVersion = ContextVersion.getMainAppCodeVersion(appCodeVersions)
  if (!mainAppCodeVersion) {
    return null
  }
  return mainAppCodeVersion.lowerBranch
}

/**
 * get branch name of the contextVersion's main appCodeVersion
 * @return {string} branchName
 */
InstanceSchema.methods.getMainBranchName = function () {
  var log = logger.log.child({
    method: 'InstanceSchema.methods.getMainBranchName'
  })
  log.info('called')
  return Instance.getMainBranchName(this)
}

/**
 * Helper method to find the main app code version and get the repo name.
 * If it's not a repo based instance it returns null
 * @returns {String|null} - Repository name or null if not a repo container
 */
InstanceSchema.methods.getRepoName = function () {
  var appCodeVersions = keypather.get(this, 'contextVersion.appCodeVersions')
  if (!appCodeVersions || appCodeVersions.length <= 0) {
    return null
  }
  var mainAppCodeVersion = ContextVersion.getMainAppCodeVersion(appCodeVersions)
  if (!mainAppCodeVersion) {
    return null
  }
  return mainAppCodeVersion.repo
}

/**
 * get the elastic hostname of the instance
 * @param {string} ownerUsername instance owner's username
 * @return {string} elasticHostname
 */
InstanceSchema.methods.getElasticHostname = function (ownerUsername) {
  var log = logger.log.child({
    ownerUsername: ownerUsername,
    method: 'InstanceSchema.methods.getElasticHostname'
  })
  log.info('called')
  if (!ownerUsername) { throw new Error('ownerUsername is required') }
  return runnableHostname.elastic({
    shortHash: this.shortHash,
    instanceName: this.name,
    ownerUsername: ownerUsername,
    branch: this.getMainBranchName(),
    masterPod: this.masterPod,
    userContentDomain: process.env.USER_CONTENT_DOMAIN,
    isolated: this.isolated,
    isIsolationGroupMaster: this.isIsolationGroupMaster
  })
}

InstanceSchema.methods.generateGraphNode = function (ignoreIsolationProperty) {
  return {
    elasticHostname: this.elasticHostname,
    instanceId: this._id,
    name: this.name
  }
}

/**
 * Removes self from all instance dependency lists that contain it.  If this instance is not a
 * masterPod, replace it with the masterPod.  Otherwise, just remove it
 *
 * @returns  {Promise}  When all dependents have been updated
 * @resolves {Instance} This instance
 * @throws   {Error}    Any mongo error
 */
InstanceSchema.methods.removeSelfFromGraph = function () {
  var log = logger.log.child({
    instanceId: keypather.get(this, '_id'),
    instanceName: keypather.get(this, 'name'),
    method: 'InstanceSchema.methods.removeSelfFromGraph'
  })
  log.info('called')
  var self = this

  return self.getParentAsync()
    .then(function (masterInstance) {
      var updateQuery = null
      if (masterInstance) {
        updateQuery = {
          $set: {
            'dependencies.$.instanceId': masterInstance._id,
            'dependencies.$.name': masterInstance.name
          }
        }
      } else {
        updateQuery = {
          $pull: { dependencies: { instanceId: self._id } }
        }
      }
      return Instance.updateAsync(
        {
          dependencies: {
            $elemMatch: {
              instanceId: self._id
            }
          }
        },
        updateQuery,
        { multi: true })
    })
    .then(function (numUpdated) {
      log.info({
        dependenciesUpdated: numUpdated
      }, 'removed self from deps')
      return self
    })
    .finally(function () {
      self.invalidateContainerDNS()
    })
}

/**
 * Invalidates all cache entries for the instance based on its local subnet ip
 * and dock ip.
 *
 * TODO move this out of the mongoose model when we come to a conclusion on
 *   overarching models or controllers
 */
InstanceSchema.methods.invalidateContainerDNS = function () {
  var channel = process.env.REDIS_DNS_INVALIDATION_KEY
  var message = this.elasticHostname
  var log = logger.log.child({
    instanceId: keypather.get(this, '_id'),
    instanceName: keypather.get(this, 'name'),
    message: message,
    channel: channel,
    method: 'InstanceSchema.methods.invalidateContainerDNS'
  })
  log.info('called')

  if (!this.elasticHostname) {
    log.trace('Instance missing `elasticHostname`')
    return
  }

  log.trace('Container DNS Invalidate event emitted')

  // Publish the invalidate event
  pubsub.publish(channel, message)
}

/**
 * Checks the if the 'possibleHostnameString' value contains the instance's hostname
 * @param {String}               possibleHostnameString - String (from envs or FnR) that may contain
 *                                                          an instance's hostname
 * @param {Instance|Dependency}  instance               - Instance model or dependency model
 * @returns {Boolean} True if the possibleHostnameString had the hostname in it
 */
function doesStringContainInstanceHostname (possibleHostnameString, instance) {
  if (!keypather.get(instance, 'elasticHostname')) {
    return false
  }
  var re = new RegExp(escapeRegExp(instance.elasticHostname), 'i')
  return re.test(possibleHostnameString)
}

/**
 * Searches through a list of instances to find the first one that matches the hostname
 * @param {String}                possibleHostnameString     - String (from envs or FnR) that may contain
*                                                                an instance's hostname
 * @param {[Instance|Dependency]} instanceList               - instances to search through
 * @returns {Instance|null} instance with the given hostname
 */
function findMatchingInstanceByHostname (possibleHostnameString, instanceList) {
  return find(instanceList, function (instance) {
    return doesStringContainInstanceHostname(possibleHostnameString, instance)
  })
}

/**
 * Used for finding instances for new connections.  This searches for either masterpods or isolated
 * containers, and adds the instance's hostname to itself.  If the instance is not isolated, and
 * checkIsolated is true, this resolves an empty array.
 *
 * @param {String}  ownerUsername - Used by the elasticHostname generator
 * @param {Boolean} checkIsolated - true if this should query isolation is
 * @returns  {Promise}     resolves when the instance fetch query resolves
 * @resolves {[Instances]} either masterpod instances or instances part of the same isolation group
 */
InstanceSchema.methods.fetchMatchingInstancesForDepChecking = function (ownerUsername, checkIsolated) {
  var log = logger.log.child({
    instanceId: keypather.get(this, '_id'),
    instanceName: keypather.get(this, 'name'),
    ownerUsername: ownerUsername,
    checkIsolated: checkIsolated,
    method: 'InstanceSchema.methods.fetchMatchingInstancesForDepChecking'
  })
  log.info('called')
  if (checkIsolated && !this.isolated) { return Promise.resolve([]) }
  var query = {
    'owner.github': this.owner.github
  }
  if (checkIsolated) {
    query.isolated = this.isolated
  } else {
    query.masterPod = true
  }
  return Instance.findAsync(query)
}

InstanceSchema.methods.getHostnamesFromEnvsAndFnr = function () {
  var log = logger.log.child({
    instanceId: keypather.get(this, '_id'),
    instanceName: keypather.get(this, 'name'),
    method: 'InstanceSchema.methods.getHostnamesFromEnvsAndFnr'
  })
  log.info('called')

  // Lets be cool and treat the Find and Replace rules as envs
  var linkedHostnames = []
  if (Array.isArray(keypather.get(this, 'contextVersion.appCodeVersions'))) {
    this.contextVersion.appCodeVersions.forEach(function (acv) {
      if (Array.isArray(keypather.get(acv, 'transformRules.replace'))) {
        acv.transformRules.replace.forEach(function (replaceModel) {
          linkedHostnames.push(replaceModel.replace)
        })
      }
    })
  }
  // Now add the instance's envs in there, after stripping off the variable
  this.env.forEach(function (envStatement) {
    linkedHostnames.push(envStatement.split('=')[1])
  })
  return linkedHostnames
}

/**
 * Looks at the envs and it's current FnR rules, and finds all of the possible runnable hostnames in
 * them.  Once it has all of those, it matches those hostnames to any of it's fellow isolation
 * containers (if isolated) or other masterpods.  It then compares the list to what it already has,
 * then adds any new ones, and removes any that are no longer in the list
 * @param ownerUsername
 * @param cb
 * @returns {Promise} resolves when all the
 * @resolves
 * @throws AggregateError Throws from instance and dependency fetches
 */
InstanceSchema.methods.setDependenciesFromEnvironment = function (ownerUsername, cb) {
  var log = logger.log.child({
    instanceId: keypather.get(this, '_id'),
    instanceName: keypather.get(this, 'name'),
    method: 'InstanceSchema.methods.setDependenciesFromEnvironment'
  })
  log.info('called')
  var self = this
  ownerUsername = ownerUsername.toLowerCase()

  Promise.props({
    dependencies: self.getDependenciesAsync(),
    masterInstances: self.fetchMatchingInstancesForDepChecking(ownerUsername),
    isolatedInstances: self.fetchMatchingInstancesForDepChecking(ownerUsername, true)
  })
    .then(function (results) {
      var deps = results.dependencies // existing dependencies
      var isolated = results.isolatedInstances // instances in the same isolation group
      var masters = results.masterInstances

      var linkedHostnames = self.getHostnamesFromEnvsAndFnr()
        .filter(function filterOutSelf (hostname) {
          return !doesStringContainInstanceHostname(hostname, self)
        })

      var envDeps = linkedHostnames.map(function findAllMatchingInstancesByHostname (val) {
        var instance = null
        // Always add the original deps first so we don't destroy the current connections
        var dep = findMatchingInstanceByHostname(val, deps)
        if (dep) {
          return dep
        }
        // first check the isolated instances.
        if (self.isolated) {
          instance = findMatchingInstanceByHostname(val, isolated)
        }
        if (!instance) {
          instance = findMatchingInstanceByHostname(val, masters)
        }
        if (instance) {
          // maybe add this dep if doesn't already exist
          return instance
        }
      }).filter(exists)
      // check existing deps, to determine which to add and remove
      var subtract = new Subtract(depsEqual)
      var remDeps = subtract.sub(deps, envDeps)
      var addDeps = subtract.sub(envDeps, deps)

      log.trace({
        remDeps: remDeps,
        addDeps: addDeps
      }, 'Adding and removing deps')

      function toAddTask (dep) {
        return self.addDependency(dep)
      }
      function toRemTask (dep) {
        return self.removeDependency(dep._id)
      }
      // convert addDeps and remDeps to tasks
      return Promise.all([
        Promise.map(addDeps, toAddTask),
        Promise.map(remDeps, toRemTask)
      ])
    })
    .finally(function () {
      log.trace('Updated deps')
      self.invalidateContainerDNS()
    })
    .asCallback(cb)
}

function depsEqual (depA, depB) {
  // we assume deps have the same keys
  var keypaths = [
    'elasticHostname',
    'name'
  ]
  return keypaths.every(function (keypath) {
    var valA = keypather.get(depA, keypath + '.toString().toLowerCase()')
    var valB = keypather.get(depB, keypath + '.toString().toLowerCase()')
    return valA === valB
  })
}

/**
 * Goes through a given instance's dependencies, looking for a match for the given elasticHostname
 *
 * @param {Instance} instance        - Instance with dependencies to search through
 * @param {String}   elasticHostname - elastic hostname to search
 *
 * @returns {GraphNode|null} Either the matching node for the given hostname, or null
 */
function getDepFromInstance (instance, elasticHostname) {
  if (keypather.get(instance, 'dependencies.length')) {
    var deps = instance.dependencies.filter(function (dep) {
      return dep.elasticHostname === elasticHostname
    })
    return deps.length ? deps[0] : null
  }
}

/**
 * Adds the given instance to THIS instance's dependency list
 *
 * @param    {Instance} instance - instance to become a dependent
 *
 * @returns  {Promise}         When the dependency has been added
 * @resolves {Instance}        This instance, updated
 * @throws   {Boom.notFound}   If THIS instance could not be found
 * @throws   {Boom.badRequest} If the update failed
 * @throws   {Error}           Any Mongo error
 */
InstanceSchema.methods.addDependency = function (instance) {
  var elasticHostname = instance.elasticHostname.toLowerCase()
  var log = logger.log.child({
    instanceId: keypather.get(this, '_id'),
    instanceName: keypather.get(this, 'name'),
    dependentInstanceId: keypather.get(instance, '_id'),
    dependentInstanceName: keypather.get(instance, 'name'),
    elasticHostname: elasticHostname,
    method: 'InstanceSchema.methods.addDependency'
  })
  log.info('addDependency called')

  var self = this

  return Instance.findByIdAsync(this._id)
    .tap(function (updatedInstance) {
      if (!updatedInstance) {
        // the update failed
        throw Boom.notFound('This instance could not be found!', {
          dependency: instance._id.toString(),
          dependent: self._id.toString()
        })
      }
    })
    .then(function (thisInstance) {
      // add it to the dep list
      return Instance.findOneAndUpdateAsync({
        _id: thisInstance._id
      }, {
        $push: {
          dependencies: instance.generateGraphNode()
        }
      })
    })
    .tap(function (updatedInstance) {
      if (!updatedInstance) {
        // the update failed
        throw Boom.badRequest('Instance deps not updated!', {
          dependency: instance._id.toString(),
          dependent: self._id.toString()
        })
      }
    })
    .then(function (instance) {
      return getDepFromInstance(instance, elasticHostname)
    })
    .finally(function () {
      self.invalidateContainerDNS()
    })
}

/**
 * Remove an instance dependency from THIS instance
 *
 * @param {ObjectId} instanceId - instance id to remove as a dependent
 *
 * @return  {Promise}         When the dependency has been removed
 * @resolve {Instance}        This instance, updated without the dependency
 * @throws  {Boom.notFound}   When this instance failed to update
 * @throws  {Error}           Mongo Errors
 */
InstanceSchema.methods.removeDependency = function (instanceId) {
  var self = this
  return Instance.findByIdAndUpdateAsync(this._id, {
    $pull: {
      dependencies: {
        instanceId: instanceId
      }
    }
  })
    .tap(function (instance) {
      if (!instance) {
        // the update failed
        throw Boom.notFound('Instance deps not updated!', {
          dependency: instanceId.toString(),
          dependent: self._id.toString()
        })
      }
    })
    .finally(function () {
      self.invalidateContainerDNS()
    })
}

/**
 * Fetches instances which depend on THIS instance
 *
 * @return  {Promise}    When the dependents have been fetched
 * @resolve {[Instance]} Instances that depend on THIS instance
 * @throws  {Error}      Mongo Errors
 */
InstanceSchema.methods.getDependents = function () {
  var log = logger.log.child({
    instanceId: keypather.get(this, '_id'),
    instanceName: keypather.get(this, 'name'),
    method: 'InstanceSchema.methods.getDependents'
  })
  log.info('called')

  return Instance.findAsync({
    dependencies: {
      $elemMatch: {
        instanceId: this._id
      }
    }
  })
}

/**
 * Fetches the instance models for each dependency belonging to THIS instance
 *
 * @param {Object}   params          - optional filter parameters
 * @param {String}   params.hostname - filter dependencies by hostname
 * @param {Function} cb              - callback
 *
 * @return  {Promise}         When the dependencies have been fetched
 * @resolve {[Instance]}      Instances that THIS instance depends on
 * @throws  {Boom.notFound}   When THIS instance could not be found
 * @throws  {Error}           Mongo Errors
 */
InstanceSchema.methods.getDependencies = function (params, cb) {
  var log = logger.log.child({
    instanceId: keypather.get(this, '_id'),
    instanceName: keypather.get(this, 'name'),
    params: params,
    method: 'InstanceSchema.methods.getDependencies'
  })
  log.info('called')
  if (isFunction(params)) {
    cb = params
    params = {}
  }
  return Instance.findByIdAsync(this._id)
    .tap(instance => {
      if (!instance) {
        throw new Instance.NotFoundError('This instance could not be found!', {
          instance: this._id.toString()
        })
      }
    })
    .then(instance => {
      // this method will throw if there isn't a hostname, or an alias.  So use that to control
      // the flow of this
      return instance.convertAliasToDependency(params.hostname)
        .then(dependency => [dependency])
        .catch(Instance.NotFoundError, Instance.IncorrectStateError, () => {
          // It wasn't an alias, so maybe it's a dep?
          let dependencies = instance.dependencies || []
          if (params.hostname) {
            // Only get the dependency that matches the hostname
            dependencies = dependencies.filter(dep => params.hostname === dep.elasticHostname)
          } else {
            // Remove self from the list (if it exists)
            dependencies = dependencies.filter(dep => this._id.toString() !== dep.id)
          }
          // Annotate dependencies with additional instance information (currently
          // only adding network information for charon)
          return Promise
            .map(dependencies, dep => Instance.findByIdAsync(dep.instanceId))
            .filter(exists)
        })
    })
    .catch(Instance.NotFoundError, err => {
      // the update failed
      throw Boom.notFound('This instance could not be found!', { err })
    })
    .asCallback(cb)
}

/**
 * Given an alias (hostname), find the instance being referred to, and resolve it
 *
 * @param {String} alias - Hostname that some instance is using to reference another instance
 *
 * @resolves {Instance}                 - Dependent Instance model referenced by the given alias
 *
 * @throws Instance.IncorrectStateError - When we're looking for a dependency in an instance
 *                                          isn't a masterpod nor isolated
 * @throws Instance.NotFoundError       - When no alias is given
 * @throws Instance.NotFoundError       - When the alias isn't present in this Instance
 * @throws Instance.NotFoundError       - When the Dependency Instance fetch fails
 *
 */
InstanceSchema.methods.convertAliasToDependency = Promise.method(function (alias) {
  var log = logger.log.child({
    instanceId: keypather.get(this, '_id'),
    aliases: keypather.get(this, 'aliases'),
    alias,
    method: 'InstanceSchema.methods.convertAliasesToDeps'
  })
  log.info('called')
  if (!alias) {
    throw new Instance.NotFoundError({ alias })
  }
  const base64Alias = new Buffer(alias).toString('base64')
  const aliasModel = this.aliases[base64Alias]
  if (!aliasModel) {
    throw new Instance.NotFoundError({ alias, base64Alias, aliases: this.aliases })
  }
  const query = {
    'contextVersion.context': aliasModel.contextId
  }
  if (this.masterPod) {
    query.masterPod = true
  } else if (this.isolated) {
    query.isolated = this.isolated
  } else {
    // This shouldn't happen, so if it does, alert Nathan
    throw new Instance.IncorrectStateError('be masterPod or isolated', 'neither')
  }
  return Instance.findOneAsync(query)
    .tap(instance => {
      if (!instance) {
        throw new Instance.NotFoundError(query)
      }
    })
})

/**
 * Fetch all of the MasterPods that should be autoForked, given the list of instances which should
 * be autoDeployed.  By using this list, we can find all of the child instances that were updated.
 * With that, we know which masterPods don't have this child by querying all of the instances with
 * contextIds not belonging to those children
 *
 * @param  {String}      repo                  - full repo name (username/reponame) which was updated
 * @param  {String}      branch                - branch name which was updated, so find all != this
 * @param  {[Instances]} autoDeployedInstances - instances with this repo/branch
*                                        (This list can be obtained with findInstancesLinkedToBranch)
 *
 * @return {Promise}      Resolves when the instance list fetch has finished
 * @resolves {[Instance]} List of MasterPods that should be autoForked
 */
InstanceSchema.statics.findMasterPodsToAutoFork = function (repo, branch, autoDeployedInstances) {
  var log = logger.log.child({
    repo: repo,
    branch: branch,
    autoDeployedInstances: autoDeployedInstances.map(pluck('contextVersion.context')),
    method: 'InstanceSchema.statics.findMasterPodsToAutoFork'
  })
  log.info('called')
  // We need to collect all of the contextIds of all of these instances
  // (including locked ones, discluding isolated)
  // so we can later find all the masters that don't have a child with this branch
  var instancesByContextId = {}
  // Since all of these given instances are all of the instances with the given repo/branch,
  // we should be able to grab all of the masterPods that are missing this child by grabbing
  // all of the child instances in this list, and use their contextIds to filter out MasterPods
  // with this repo
  autoDeployedInstances.forEach(function (instance) {
    var contextId = keypather.get(instance, 'contextVersion.context.toString()')
    if (!instancesByContextId[contextId]) {
      instancesByContextId[contextId] = []
    }
    instancesByContextId[contextId].push(instance)
  })
  // Now that we have the instances separated by contextId, we can filter out all instanes
  // which aren't children (masterPods and isolated children)
  var dontForkTheseContextIds = Object.keys(instancesByContextId)
    .filter(function (contextId) {
      // filter out all contextIds without any instances left, since those belong
      // to master instances without children that need to be forked
      return instancesByContextId[contextId]
        .filter(function (instance) {
          if (instance.masterPod) {
            // MasterPods with this repo/branch SHOULD NOT be forked, because... duh
            return true
          }
          if (instance.isolated && !instance.isIsolationGroupMaster) {
            // this is a copy of the instance which is part of some other isolation
            // It's master may not have a child instance
            return false
          }
          // If not any of those, it's just a child (possibly an isIsolationGroupMaster)
          return true
        }).length
    })
  var query = {
    masterPod: true,
    shouldNotAutofork: { $ne: true },
    'contextVersion.appCodeVersions': {
      $elemMatch: {
        lowerRepo: repo.toLowerCase(),
        lowerBranch: { $ne: branch.toLowerCase() },
        additionalRepo: { $ne: true }
      }
    }
  }
  if (dontForkTheseContextIds.length) {
    query['contextVersion.context'] = { $nin: dontForkTheseContextIds.map(objectId) }
  }
  return Instance.findAsync(query)
}

/**
 * find all instances that have `parent` = `shortHash`. will fetched only
 * autoForked instances.
 * @param  {String}   shortHash   shortHash of a parent instance used for search
 * @param  {Function} cb     callback
 */
InstanceSchema.statics.findInstancesByParent = function (shortHash, cb) {
  var log = logger.log.child({
    shortHash: shortHash,
    method: 'InstanceSchema.statics.findInstancesByParent'
  })
  log.info('called')
  Instance.find({
    autoForked: true,
    parent: shortHash
  }, cb)
}

/**
 * returns parent of this instance (should be masterPod)
 * @param  {Function} cb (err, parentInstance)
 */
InstanceSchema.methods.getParent = function (cb) {
  var log = logger.log.child({
    instanceId: keypather.get(this, '_id'),
    instanceName: keypather.get(this, 'name'),
    parent: keypather.get(this, 'parent'),
    method: 'InstanceSchema.methods.getParent'
  })
  log.info('called')
  Instance.findOneByShortHash(this.parent, cb)
}

/**
 * find all forked instances that use specific repo and branch.
 * filter only instance that are non isolated or isolation group masters
 * @param  {String}   repo   full repo name (username/reponame)
 * @param  {String}   branch branch name
 * @returns {Promise} array of Instances
 */
InstanceSchema.statics.findNonIsolatedForkedInstances = function (repo, branch) {
  var log = logger.log.child({
    repo: repo,
    branch: branch,
    method: 'InstanceSchema.statics.findNonIsolatedForkedInstances'
  })
  log.info('findNonIsolatedForkedInstances called')
  if (!repo && !branch) {
    return Promise.resolve(null)
  }
  var query = {
    masterPod: false,
    $or: [
      {
        isolated: { $exists: false }
      },
      {
        isIsolationGroupMaster: true,
        isolated: { $exists: true }
      }
    ],
    autoForked: true,
    'contextVersion.appCodeVersions': {
      $elemMatch: {
        lowerRepo: repo.toLowerCase(),
        lowerBranch: branch.toLowerCase(),
        additionalRepo: { $ne: true }
      }
    }
  }
  return this.findAsync(query)
}

/**
 * Find the master instances that exist for a given repository.
 * @param {string} repo Repository for which to search (e.g. "Runnable/cli").
 * @param {function} cb Callback with signature (err, instance).
 */
InstanceSchema.statics.findMasterInstancesForRepo = function (repo, cb) {
  var log = logger.log.child({
    repo: repo,
    method: 'InstanceSchema.statics.findMasterInstancesForRepo'
  })
  log.info('called')
  var query = {
    masterPod: true,
    'contextVersion.appCodeVersions': {
      $elemMatch: {
        lowerRepo: repo.toLowerCase(),
        $or: [
          { additionalRepo: false },
          { additionalRepo: { $exists: false } }
        ]
      }
    }
  }
  this.find(query, cb)
}

/**
 * Find the master instance for an isolation
 * @param {ObjectId} Isolation ID - ID of the isolation
 * @param {function} cb           - Callback with signature (err, instance).
 */
InstanceSchema.statics.findIsolationMaster = function (isolationId, cb) {
  var log = logger.log.child({
    isolationId: isolationId,
    method: 'InstanceSchema.statics.findIsolationMaster'
  })
  log.info('called')
  var query = {
    isolated: isolationId,
    isIsolationGroupMaster: true
  }
  this.findOne(query, cb)
}

/**
 * Find the instances that exist for a given repository.
 * @param {ObjectId} isolationID  - ID of the isolation
 * @param {String}   repoName     - Repository for which to search (e.g. "Runnable/cli").
 * @param {Function} cb           - Callback with signature (err, instance).
 */
InstanceSchema.statics.findInstancesInIsolationWithSameRepoAndBranch = function (isolationId, repoName, branchName, cb) {
  var query = {
    isolated: isolationId,
    'contextVersion.appCodeVersions': {
      $elemMatch: {
        lowerRepo: repoName.toLowerCase(),
        lowerBranch: branchName.toLowerCase(),
        additionalRepo: { $ne: true }
      }
    }
  }
  var log = logger.log.child({
    repoName: repoName,
    query: query,
    isolationId: isolationId.toString(),
    method: 'InstanceSchema.statics.findInstancesInIsolationWithSameRepoAndBranch'
  })
  log.info('called')
  this.find(query, cb)
}

/**
 * find all instances that use specific repo and branch.
 * We only care about main repos (additionalRepo=false).
 * @param  {String}   repo      - full repo name (username/reponame)
 * @param  {String}   branch    - branch name
 * @param  {Function} cb        - callback
 */
InstanceSchema.statics.findInstancesLinkedToBranch = function (repo, branch, cb) {
  var log = logger.log.child({
    repo: repo,
    branch: branch,
    method: 'InstanceSchema.statics.findInstancesLinkedToBranch'
  })
  log.info('findInstancesLinkedToBranch called')
  var query = {
    'contextVersion.appCodeVersions': {
      $elemMatch: {
        lowerRepo: repo.toLowerCase(),
        lowerBranch: branch.toLowerCase(),
        additionalRepo: { $ne: true }
      }
    }
  }
  this.find(query, cb)
}

/**
 * find all instances that match repo, branch, contextId and build hash
 *
 * @param  {String}    repo                   - full repo name (username/reponame)
 * @param  {String}    branch                 - branch name
 * @param  {String}    contextId              - ObjectId of context to use
 * @param  {String=}   hash                   - build hash which is really files hash
 * @param  {Boolean=}  hasBuildDockerfilePath - True if we are mirroring dockerfile
 *
 * @resolve {Promise}
 * @returns {Array} array of found instances
 */
InstanceSchema.statics.findInstancesForBranchAndBuildHash = function (repo, branch, contextId, hash, hasBuildDockerfilePath) {
  var log = logger.log.child({
    repo, branch, contextId, hash, hasBuildDockerfilePath,
    method: 'InstanceSchema.statics.findInstancesForBranchAndBuildHash'
  })
  log.info('findInstancesForBranchAndBuildHash called')
  var query = {
    'contextVersion.context': objectId(contextId),
    'contextVersion.appCodeVersions': {
      $elemMatch: {
        lowerRepo: repo.toLowerCase(),
        lowerBranch: branch.toLowerCase(),
        additionalRepo: { $ne: true }
      }
    }
  }
  // Ignore hash if property we are mirroring the Dockerfile, since build
  // has a 1 to 1 connection to the commit
  if (!hasBuildDockerfilePath) {
    if (hash) {
      query['contextVersion.build.hash'] = hash
    } else {
      query['contextVersion.build.hash'] = { $exists: false }
    }
  }
  return this.findAsync(query)
}

/**
 * Find all instances with a specific set of context versions
 * @param {Array}    ContextVersions ids
 * @param {Function} Callback
 */
InstanceSchema.statics.findByContextVersionIds = function (contextVersionIds, cb) {
  var log = logger.log.child({
    contextVersionIds: contextVersionIds,
    method: 'InstanceSchema.statics.findByContextVersionIds'
  })
  log.info('called')
  contextVersionIds = contextVersionIds.map(objectId)
  var query = {
    'contextVersion._id': { $in: contextVersionIds }
  }
  log.trace({
    contextVersionIds: contextVersionIds,
    query: query
  }, 'InstanceSchema.statics.findByContextVersionIds query')
  this.find(query, cb)
}

/**
 * Updates all instances matching on the context version id with key/value pairs from the object passed in
 * @param contextVersionId - Context version to update
 * @param objToSetOnContextVersion - An object containing key value pairs that
 *        match to key value pairs on the contextVersion
 * @param cb - Callback
 */
InstanceSchema.statics.updateContextVersion = function (contextVersionId, objToSetOnContextVersion, cb) {
  var log = logger.log.child({
    contextVersionId: contextVersionId,
    objToSetOnContextVersion: objToSetOnContextVersion,
    method: 'InstanceSchema.statics.updateContextVersion'
  })
  log.info('called')
  var query = {
    'contextVersion.id': contextVersionId
  }
  var update = {
    $set: {}
  }
  Object.keys(objToSetOnContextVersion).forEach(function (key) {
    update.$set['contextVersion.' + key] = objToSetOnContextVersion[key]
  })
  Instance.update(query, update, { multi: true }, cb)
}

/**
 * Update the context version with the latest version
 * @return {Promise}
 * @resolves {Object} updated instance with new `contextVersion`
 * @throws {Boom.notFound} when context version wasn't found
 */
InstanceSchema.methods.updateCv = function () {
  var instance = this
  var cvId = keypather.get(instance, 'contextVersion._id.toString()')
  var instanceId = keypather.get(instance, '_id')
  var log = logger.log.child({
    instance: instance,
    cvId: cvId,
    method: 'InstanceSchema.methods.updateCv'
  })
  log.info('called')
  return ContextVersion.findByIdAsync(cvId, {'build.log': 0})
    .tap(function (cv) {
      if (!cv) {
        log.error('Not context version found for an instance')
        throw Boom.notFound('No context version found for this instance', {
          cvId: cvId,
          instanceId: instanceId
        })
      }
    })
    .tap(function (cv) {
      var query = {
        _id: instanceId,
        'contextVersion._id': objectId(cvId)
      }
      return Instance.findOneAndUpdateAsync(query, { $set: { contextVersion: cv.toJSON() } }, { new: true })
    })
    .then(function (cv) {
      instance.contextVersion = cv.toJSON()
      return instance
    })
}

/**
 * update container error (completed and error)
 *   only updates the instance if the container has not changed
 *   this is also used for container-start errors
 *   layer issues prevent start from creating a container
 * @param {String}   contextVersionId context version id for which the container create errored
 * @param {Error}    err container create err
 * @param {Function} cb  callback(err, instance)
 */
InstanceSchema.methods.modifyContainerCreateErr = function (contextVersionId, err, cb) {
  var query = {
    _id: this._id,
    'contextVersion._id': objectId(contextVersionId)
  }
  var setData = {
    container: {
      error: pick(err, [ 'message', 'stack', 'data' ])
    }
  }
  var log = logger.log.child({
    instanceId: keypather.get(this, '_id'),
    instanceName: keypather.get(this, 'name'),
    contextVersionId: contextVersionId,
    err: err,
    query: query,
    setData: setData,
    method: 'InstanceSchema.methods.modifyContainerCreateErr'
  })
  log.info('called')
  if (!err || Object.keys(err).length === 0) {
    log.error('err was not provided')
    return cb(Boom.badImplementation('Create container error was not defined'))
  }
  // Note: update instance only if cv (build) has not changed (not patched)
  var self = this
  Instance.findOneAndUpdate(query, {
    $set: setData
  }, function (updateErr, instance) {
    if (updateErr) {
      log.error({
        updateErr: updateErr
      }, 'Instance.findOneAndUpdate error')
      return cb(updateErr)
    }
    if (!instance) {
      log.warn('Instance.findOneAndUpdate !instance')
      // just log this secondary error, this route is already errored
      error.log(Boom.conflict("Container error was not set, instance's cv has changed"))
      log.error('Container error was not set, instances cv has changed')
      return cb(null, self)
    }
    log.trace('Instance.findOneAndUpdate success')
    cb(null, instance)
  })
}

/**
 * update container error for instance with given container
 *   only updates the instance if the container has not changed
 * @param {String}   instanceId    id of instance that need to be updated
 * @param {String}   containerId   id of container that error'd
 * @param {String}   errMsg        error message
 * @returns {Promise}
 * @resolves {Instance} updated instance with error on it
 * @rejects {Boom.notFound} when instance changed / not found
 */
InstanceSchema.statics.setContainerError = function (instanceId, containerId, errMsg) {
  var query = {
    _id: instanceId,
    'container.dockerContainer': containerId
  }
  // Note: update instance only if container not changed
  var update = {
    $set: {
      'container.error.message': errMsg,
      'container.inspect.State.Dead': false,
      'container.inspect.State.Error': errMsg,
      'container.inspect.State.OOMKilled': false,
      'container.inspect.State.Paused': false,
      'container.inspect.State.Restarting': false,
      'container.inspect.State.Running': false,
      'container.inspect.State.Starting': false,
      'container.inspect.State.Status': 'error',
      'container.inspect.State.Stopping': false
    }
  }
  logger.log.info('setContainerError called')
  return Instance._updateAndCheck(query, update)
}

/**
 * update single instance with passed update
 * @param  {Object} query  mongo query to match
 * @param  {Object} update update to be applied
 * @return {Promise}
 * @resolves {Instance} updated instance with error on it
 * @rejects {Boom.notFound} when instance changed / not found
 */
InstanceSchema.statics._updateAndCheck = function (query, update) {
  var log = logger.log.child({
    query: query,
    update: update,
    method: 'InstanceSchema._updateAndCheck'
  })
  return Instance.findOneAndUpdateAsync(query, update)
    .catch(function (err) {
      log.error({ updateErr: err }, 'Instance._updateAndCheck error')
      throw err
    })
    .tap(function (instance) {
      if (!instance) {
        log.error('instance not found')
        throw Boom.notFound('instance not found', {
          query: query,
          update: update
        })
      }
      log.trace('Instance._updateAndCheck success')
    })
}

/**
 * update container error for instance with cv
 * @param {String}   instanceId         id of instance that need to be updated
 * @param {String}   contextVersionId   id of cv we are trying to create from
 * @param {String}   errMsg        error message
 * @returns {Promise}
 * @resolves {Instance} updated instance with error on it
 * @rejects {Boom.notFound} when instance changed / not found
 */
InstanceSchema.statics.setContainerCreateError = function (instanceId, contextVersionId, errMsg) {
  logger.log.info({
    instanceId: instanceId,
    contextVersionId: contextVersionId
  }, 'setContainerCreateError called')
  // Note: update instance only if context version has not changed and we don't have a container
  var query = {
    _id: instanceId,
    'contextVersion._id': objectId(contextVersionId),
    'container': {
      $exists: false
    }
  }
  var update = {
    $set: {
      'container.error.message': errMsg,
      'container.inspect.State.Dead': false,
      'container.inspect.State.Error': errMsg,
      'container.inspect.State.OOMKilled': false,
      'container.inspect.State.Paused': false,
      'container.inspect.State.Restarting': false,
      'container.inspect.State.Running': false,
      'container.inspect.State.Starting': false,
      'container.inspect.State.Status': 'error',
      'container.inspect.State.Stopping': false
    }
  }

  return Instance._updateAndCheck(query, update)
}

/** Check to see if a instance is public.
 *  @param {function} [cb] function (err, {@link module:models/instance Instance}) */
InstanceSchema.methods.isPublic = function (cb) {
  var log = logger.log.child({
    instanceId: keypather.get(this, '_id'),
    instanceName: keypather.get(this, 'name'),
    method: 'InstanceSchema.methods.isPublic'
  })
  log.info('called')
  var err
  if (!this.public) {
    err = Boom.forbidden('Instance is private')
  }
  cb(err, this)
}

/**
 * Set instance fields being isolated.
 * @param {ObjectId} isolationId ID of the Isolation to associate this instance.
 * @returns {Promise} Resolves with updated Instance.
 */
InstanceSchema.methods.isolate = function (isolationId, isMaster) {
  var log = logger.log.child({
    instanceId: keypather.get(this, '_id'),
    instanceName: keypather.get(this, 'name'),
    method: 'InstanceSchema.methods.isolate'
  })
  log.info('called')
  return Promise.bind(this)
    .then(function () {
      if (!exists(isolationId)) {
        throw new Error('.isolate requires isolationId')
      }
      if (!utils.isObjectId(isolationId)) {
        throw new Error('.isolate requires an ObjectID for isolationId')
      }
    })
    .then(function () {
      var findOpts = { _id: this._id }
      var update = {
        $set: {
          isolated: isolationId,
          isIsolationGroupMaster: !!isMaster
        }
      }
      return Instance.findOneAndUpdateAsync(findOpts, update)
    })
}

/**
 * Unset container.
 * @returns {Promise} Resolves with updated Instance.
 */
InstanceSchema.methods.unsetContainer = function () {
  const log = logger.log.child({
    instanceId: keypather.get(this, '_id'),
    instanceName: keypather.get(this, 'name'),
    method: 'InstanceSchema.methods.unsetContainer'
  })
  log.info('called')
  const findOpts = { _id: this._id }
  const update = {
    $unset: {
      container: true
    }
  }
  return Instance.findOneAndUpdateAsync(findOpts, update)
}

/**
 * Unset instance fields from being Isolated.
 * @returns {Promise} Resolves with updated Instance.
 */
InstanceSchema.methods.deIsolate = function () {
  const log = logger.log.child({
    instanceId: keypather.get(this, '_id'),
    instanceName: keypather.get(this, 'name'),
    method: 'InstanceSchema.methods.deIsolate'
  })
  log.info('called')
  const findOpts = { _id: this._id }
  const update = {
    $unset: {
      isolated: true,
      isIsolationGroupMaster: true
    }
  }
  return Instance.findOneAndUpdateAsync(findOpts, update)
}

Instance = module.exports = mongoose.model('Instances', InstanceSchema)

Promise.promisifyAll(Instance)
Promise.promisifyAll(Instance.prototype)

/* Helpers */
function groupBy (arr, keypath) {
  var grouped = {}
  arr.forEach(function (item) {
    var val = keypather.get(item, keypath)
    grouped[val] = grouped[val] || []
    grouped[val].push(item)
  })
  return grouped
}
function toInt (str) {
  return parseInt(str, 10)
}

/**
 * Error thrown instance is not in the expected state
 * @param {string} expectedStatus expected status of instance
 * @param {Object} instance       instance object
 * @param {Object} reporting      reporting options
 */
Instance.NotFoundError = class extends BaseSchema.NotFoundError {
  constructor (query, level) {
    super('Instance', query, level || 'critical')
  }
}

/**
 * Error thrown instance failed to create
 * @param {string} opts - data object given to the instance creation
 */
Instance.CreateFailedError = class extends BaseSchema.CreateFailedError {
  constructor (opts) {
    super('Instance', opts, 'critical')
  }
}

/**
 * Error thrown instance is not in the expected state
 * @param {string} expectedStatus expected status of instance
 * @param {string} actualStatus   status of instance
 */
Instance.IncorrectStateError = class extends BaseSchema.IncorrectStateError {
  constructor (expectedStatus, actualStatus) {
    super('Instance', expectedStatus, actualStatus, 'critical')
  }
}
