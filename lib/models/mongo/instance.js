/**
 * Instances represent collections of Containers (think Docker images/containers) that may
 * be clutered together.
 * @module lib/models/mongo/instance
 */
'use strict'

var Boom = require('dat-middleware').Boom
var async = require('async')
var Promise = require('bluebird')
var clone = require('101/clone')
var compose = require('101/compose')
var createCount = require('callback-count')
var escapeRegExp = require('regexp-quote')
var exists = require('101/exists')
var find = require('101/find')
var isFunction = require('101/is-function')
var isObject = require('101/is-object')
var hasKeypaths = require('101/has-keypaths')
var keypather = require('keypather')()
var last = require('101/last')
var mongoose = require('mongoose')
var ObjectId = require('mongoose').Types.ObjectId
var pick = require('101/pick')
var put = require('101/put')
var runnableHostname = require('runnable-hostname')
var toObjectId = require('utils/to-object-id')

var ContextVersion = require('models/mongo/context-version')
var Docker = require('models/apis/docker')
var Graph = require('models/apis/graph')
var InstanceSchema = require('models/mongo/schemas/instance')
var User = require('models/mongo/user')
var error = require('error')
var joi = require('utils/joi')
var logger = require('middlewares/logger')(__filename)
var messenger = require('socket/messenger')
var pubsub = require('models/redis/pubsub')
var removeDottedKeys = require('remove-dotted-keys')
var toJSON = require('utils/to-json')
var utils = require('middlewares/utils')

var Instance
var log = logger.log

InstanceSchema.set('toJSON', { virtuals: true })

/**
 * Helper function to add default query parameters associated with Isolation.
 * It places parameters in .$or if .isolated or .isIsolationGroupMaster
 * isn't set.
 * @param {object} query MongoDB query Object.
 * @returns {object} Query Object w/ default isolation options.
 */
InstanceSchema.statics.addDefaultIsolationOpts = function (query) {
  log.info({ tx: true, query: query }, 'InstanceSchema.addDefaultIsolationOpts')
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
  // if isolated or isIsolationGroupMaster is set, don't add anything
  if (query.isolated) { return query }
  if (query.isIsolationGroupMaster) { return query }
  if (query.$or) {
    // $or is, by definition, an array, so no need to check
    query.$or = query.$or.concat(defaultOpts.$or)
  } else {
    query.$or = defaultOpts.$or
  }
  return query
}

InstanceSchema.statics.findOneByShortHash = function (shortHash, cb) {
  log.trace({
    tx: true,
    shortHash: shortHash,
    isObjectId: utils.isObjectId(shortHash)
  }, 'InstanceSchema.statics.findOneByShortHash')
  if (utils.isObjectId(shortHash)) {
    return this.findById(shortHash, cb)
  }
  this.findOne({
    shortHash: shortHash
  }, function (err) {
    if (err) {
      log.error({
        tx: true,
        err: err
      }, 'InstanceSchema.statics.findOneByShortHash findOne error')
    } else {
      log.trace({
        tx: true
      }, 'InstanceSchema.statics.findOneByShortHash findOne success')
    }
    cb.apply(this, arguments)
  })
}

InstanceSchema.statics.findOneByContainerId = function (containerId, cb) {
  log.trace({
    tx: true,
    containerId: containerId
  }, 'InstanceSchema.statics.findOneByContainerId findOneByContainerId')
  this.findOne({
    'container.dockerContainer': containerId
  }, cb)
}

InstanceSchema.statics.findByBuild = function (build /* , args */) {
  log.trace({
    tx: true,
    build: build
  }, 'InstanceSchema.statics.findByBuild findByBuild')
  var args = Array.prototype.slice.call(arguments, 1)
  args.unshift({ build: build._id })
  this.find.apply(this, args)
}

/**
 * finds all instances on the dock (based on dockerHost)
 * @param  {String}   dockerHost format: http://10.0.0.1:4242
 * @param  {Function} cb         (err, InstanceArray)
 */
InstanceSchema.statics.findInstancesByDockerHost = function (dockerHost, cb) {
  log.info({
    tx: true,
    dockerHost: dockerHost
  }, 'InstanceSchema.statics.findInstancesByDockerHost findOneByContainerId')
  Instance.find({
    'container.dockerHost': dockerHost
  }, cb)
}

/**
 * Set all the instances that are stopping as stopped by searching for them by docker host
 * @param {String} dockerHost format: http://10.0.0.1:4242
 * @param {Function} cb (err)
 */
InstanceSchema.statics.setStoppingAsStoppedByDockerHost = function (dockerHost, cb) {
  var logData = {
    tx: true,
    dockerHost: dockerHost
  }
  log.info(logData, 'InstanceSchema.statics.setStoppingAsStoppedByDockerHost')
  Instance.update(
    {
      'container.dockerHost': dockerHost,
      'container.inspect.State.Stopping': true
    }, {
      $set: {
        'container.inspect.State.Pid': 0,
        'container.inspect.State.Running': false,
        'container.inspect.State.Restarting': false,
        'container.inspect.State.Paused': false,
        'container.inspect.State.FinishedAt': (new Date()).toISOString(),
        'container.inspect.State.ExitCode': 0
      },
      $unset: {
        'container.inspect.State.Stopping': ''
      }
    }, {
      multi: true
    }, cb)
}

/**
 * verify instance is NOT starting or stopping
 * @param {function} cb Callback function
 * @returns {null} null
 */
InstanceSchema.methods.isNotStartingOrStopping = function (cb) {
  var State = keypather.get(this, 'container.inspect.State')
  log.trace({
    tx: true,
    State: State
  }, 'InstanceSchema.methods.isNotStartingOrStopping')
  if (!State) {
    return cb(Boom.badRequest('Instance does not have a container'))
  }
  if (State.Starting) {
    return cb(Boom.badRequest('Instance is already starting'))
  }
  if (State.Stopping) {
    return cb(Boom.badRequest('Instance is already stopping'))
  }
  cb(null, this)
}

/**
 * Atomic set to starting
 * @param {function} cb Callback function
 */
InstanceSchema.methods.setContainerStateToStarting = function (cb) {
  var logData = {
    tx: true,
    instanceId: this._id,
    instanceName: this.name,
    dockerContainer: this.container.dockerContainer
  }
  log.info(logData, 'InstanceSchema.methods.setContainerStateToString')

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
      var logErrData = put({ err: err }, logData)
      log.error(logErrData,
        'InstanceSchema.methods.setContainerStateToString fineOneAndUpdate error')
      return cb(err)
    }
    if (!result) {
      log.warn(logData,
        'InstanceSchema.methods.setContainerStateToString fineOneAndUpdate !result')
      // Fetch instance to determine if it exists, or is starting or stopping
      Instance.findOne({
        _id: self._id,
        'container.dockerContainer': self.container.dockerContainer
      }, function (err, result2) {
        if (err) {
          var logErrData = put({ err: err }, logData)
          log.error(logErrData,
            'InstanceSchema.methods.setContainerStateToString fineOneAndUpdate ' +
            '!result findOne error')
          return cb(err)
        } else if (!result2) {
          return cb(Boom.badRequest('instance container has changed'))
        }
        log.trace(logData, 'InstanceSchema.methods.setContainerStateToString fineOneAndUpdate ' +
          '!result findOne success')
        cb(null, result2)
      })
    } else {
      log.trace(logData,
        'InstanceSchema.methods.setContainerStateToString fineOneAndUpdate success')
      // must preserve owner/createdBy if set via
      // populateOwnerAndCreatedBy
      result.owner = owner
      result.createdBy = createdBy
      return cb(null, result)
    }
  })
}

/**
 * Atomic set to stopping
 * @param {function} cb Callback function
 */
InstanceSchema.methods.setContainerStateToStopping = function (cb) {
  var logData = {
    tx: true,
    instanceId: this._id,
    instanceName: this.name,
    dockerContainer: this.container.dockerContainer
  }

  log.trace(logData, 'InstanceSchema.methods.setContainerStateToStopping')

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
      'container.inspect.State.Stopping': true
    }
  }, function (err, result) {
    if (err) {
      log.error({
        tx: true,
        err: err
      }, 'InstanceSchema.methods.setContainerStateToStopping fineOneAndUpdate error')
    } else if (!result) {
      log.warn({
        tx: true
      }, 'InstanceSchema.methods.setContainerStateToStopping fineOneAndUpdate')
      // Fetch instance to determine if it exists, or is starting or stopping
      Instance.findOne({
        _id: self._id,
        'container.dockerContainer': self.container.dockerContainer
      }, function (err, result2) {
        if (err) {
          var logErrData = put({ err: err }, logData)
          log.error(logErrData,
            'InstanceSchema.methods.setContainerStateToStopping fineOneAndUpdate ' +
            '!result findOne error')
          return cb(err)
        } else if (!result2) {
          return cb(Boom.badRequest('instance container has changed'))
        }
        log.trace(logData,
          'InstanceSchema.methods.setContainerStateToStopping fineOneAndUpdate ' +
          '!result findOne success')
        cb(null, result2)
      })
    } else {
      log.trace(logData,
        'InstanceSchema.methods.setContainerStateToStopping ineOneAndUpdate success')
      // must preserve owner/createdBy if set via
      // populateOwnerAndCreatedBy
      result.owner = owner
      result.createdBy = createdBy
      return cb(null, result)
    }
  })
}

/**
 * Fetch github user models for an instance owner
 * and instance createdBy user
 * @param {Object} sessionUser User Object
 * @param {Function} cb Callback function
 */
InstanceSchema.methods.populateOwnerAndCreatedBy = function (sessionUser, cb) {
  var logData = {
    tx: true,
    instanceId: this._id,
    shortHash: this.shortHash,
    'instance-owner': this.owner,
    'instance-createdBy': this.createdBy,
    sessionUser: toJSON(sessionUser)
  }
  log.trace(logData, 'InstanceSchema.methods.populateOwnerAndCreatedBy')
  var self = this
  async.parallel({
    owner: sessionUser.findGithubUserByGithubId.bind(sessionUser, this.owner.github),
    createdBy: sessionUser.findGithubUserByGithubId.bind(sessionUser, this.createdBy.github)
  }, function (err, data) {
    if (err) {
      log.error(put({
        err: err
      }, logData), 'InstanceSchema.methods.populateOwnerAndCreatedBy failure')
      return cb(err)
    }
    self.owner.username = keypather.get(data, 'owner.login')
    self.owner.gravatar = keypather.get(data, 'owner.avatar_url')
    self.createdBy.username = keypather.get(data, 'createdBy.login')
    self.createdBy.gravatar = keypather.get(data, 'createdBy.avatar_url')

    log.trace(put({
      data: toJSON(data)
    }, logData), 'InstanceSchema.methods.populateOwnerAndCreatedBy success')

    cb(null, self)
  })
}

/**
 * find instances and populate fields: cv, owner, createdBy, ...
 * @param  {User} sessionUser session user, current user using runnable
 * @return {[type]} findArgs... normal mongoose find arguments
 */
InstanceSchema.statics.findAndPopulate = function (sessionUser /*, findArgs... */) {
  var self = this
  var findArgs = Array.prototype.slice.call(arguments, 1)
  log.trace({
    tx: true,
    sessionUser: sessionUser,
    findArgs: findArgs
  }, 'InstanceSchema.statics.findAndPopulate')
  var lastIsFunction = compose(isFunction, last)
  if (lastIsFunction(findArgs)) {
    var cb = findArgs.pop()
    findArgs.push(findCb)
  }
  this.find.apply(this, findArgs)
  function findCb (err, instances) {
    if (err) { return cb(err) }
    self.populateOwnerAndCreatedByForInstances(sessionUser, instances, cb)
  }
}

InstanceSchema.statics.populateOwnerAndCreatedByForInstances = function (sessionUser, instances, cb) {
  log.info({
    tx: true,
    sessionUser: sessionUser,
    instancesLength: instances.length
  }, 'InstanceSchema.statics.populateOwnerAndCreatedByForInstances')
  if (instances.length === 0) {
    done()
  } else {
    var instancesByOwnerGithubId = groupBy(instances, 'owner.github')
    var ownerGithubIds = Object.keys(instancesByOwnerGithubId)
    var instancesByCreatedByGithubId = groupBy(instances, 'createdBy.github')
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
 * get number of instance nodes in graph
 * (good for a health check)
 * @param {function} cb - callback
 */
InstanceSchema.statics.getGraphNodeCount = function (cb) {
  var client = new Graph()
  client.graph.getNodeCount('Instance', cb)
}

/**
 * get lowercase branch name of the contextVersion's main appCodeVersion
 * @param  {object} instance instance object to get main branch from
 * @return {string} branchName or null if no appCodeVersion
 */
InstanceSchema.statics.getMainBranchName = function (instance) {
  log.trace({
    tx: true,
    instance: instance
  }, 'getMainBranchName')
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
  return Instance.getMainBranchName(this)
}

/**
 * get the elastic hostname of the instance
 * @param {string} ownerUsername instance owner's username
 * @return {string} elasticHostname
 */
var fieldsForHostname = {
  shortHash: 1,
  name: 1,
  lowerName: 1,
  contextVersion: 1,
  masterPod: 1,
  owner: 1
}
InstanceSchema.methods.getElasticHostname = function (ownerUsername) {
  if (!ownerUsername) { throw new Error('ownerUsername is required') }
  return runnableHostname.elastic({
    shortHash: this.shortHash,
    instanceName: this.name,
    ownerUsername: ownerUsername,
    branch: this.getMainBranchName(),
    masterPod: this.masterPod,
    userContentDomain: process.env.USER_CONTENT_DOMAIN
  })
}

/**
 * generate graph node for `this` instance
 * @returns {object} node
 */
InstanceSchema.methods.generateGraphNode = function () {
  var node = {
    label: 'Instance',
    props: {
      id: this.id.toString(),
      shortHash: this.shortHash,
      name: this.name,
      lowerName: this.lowerName,
      // eslint dislikes quoted props and non-camelcase keys. such contradiction
      'owner_github': keypather.get(this, 'owner.github'), // eslint-disable-line quote-props
      'contextVersion_context': // eslint-disable-line quote-props
      keypather.get(this, 'contextVersion.context').toString()
    }
  }
  log.trace({ tx: true, node: node }, 'generateGraphNode')
  return node
}

/**
 * finds node for `this` instance in the graph database
 * @param {function} cb callback
 */
InstanceSchema.methods.getSelfFromGraph = function (cb) {
  var client = new Graph()
  var node = this.generateGraphNode()
  client.graph.getNodes(node, [], function (err, nodes) {
    if (err) { return cb(err) }
    if (!nodes.length) { return cb(new Error('could not retrieve node from graph')) }
    cb(null, nodes[0])
  })
}

/**
 * removes all connections to this instance
 * and updates all dependents to point to master
 * @param  {Function} cb (err, thisInstance)
 */
InstanceSchema.methods.removeSelfFromGraph = function (cb) {
  var self = this
  var client = new Graph()
  var node = self.generateGraphNode()
  self.getDependents(function (err, dependents, allNodes) {
    if (err) {
      if (err.code !== 'Neo.ClientError.Statement.EntityNotFound') {
        return cb(err)
      }
      return cb(null)
    }
    client.graph.deleteNodeAndConnections(node, function (err) {
      if (err) {
        if (err.code !== 'Neo.ClientError.Statement.EntityNotFound') {
          return cb(err)
        }
        return cb(null)
      }
      if (dependents.length <= 0) { return cb(null, self) }
      resetDepenentsToMaster()
    })
    function resetDepenentsToMaster () {
      self.getParent(function (err, masterInstance) {
        if (err) { return cb(err) }
        if (!masterInstance) { return cb() }
        async.eachSeries(dependents, function (depNode, _cb) {
          Instance.findById(depNode.id, function (err, instance) {
            error.logIfErr(err)
            if (err) { return _cb() }
            if (!instance) { return _cb() }
            instance.addDependency(masterInstance, allNodes.b[0].hostname, function (err) {
              error.logIfErr(err)
              _cb()
            })
          })
        }, function (err) {
          cb(err, self)
        })
      })
    }
  })
}

/**
 * write the node for `this` instance into the graph
 * @param {function} cb callback
 */
InstanceSchema.methods.upsertIntoGraph = function (cb) {
  log.trace({
    tx: true
  }, 'upsertIntoGraph')
  var client = new Graph()
  var node = this.generateGraphNode()
  client.graph.writeNode(node, function (err) {
    cb(err, this)
  }.bind(this))
}

/**
 * Invalidates all cache entries for the instance based on its local subnet ip
 * and dock ip.
 *
 * TODO move this out of the mongoose model when we come to a conclusion on
 *   overarching models or controllers
 */
InstanceSchema.methods.invalidateContainerDNS = function () {
  // Ensure we have the correct keypaths available to perform the purge
  if (!hasKeypaths(this, ['container.dockerHost'])) {
    log.warn({
      method: 'InstanceSchema.methods.invalidateContainerDNS'
    }, 'Instance missing `container.dockerHost`')
    return
  }

  if (!hasKeypaths(this, ['container.inspect.NetworkSettings.IPAddress'])) {
    log.warn({
      method: 'InstanceSchema.methods.invalidateContainerDNS'
    }, 'Instance missing `container.inspect.NetworkSettings.IPAddress`')
    return
  }

  // Determine the exact channel based on the container's host
  // Ex: `dns.invalidate.localIp:10.20.128.1`
  var hostIpMatch = this.container.dockerHost
    .match(/\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}/)
  if (!hostIpMatch) {
    log.warn({
      method: 'InstanceSchema.methods.invalidateContainerDNS',
      dockerHost: this.container.dockerHost
    }, 'Instance docker host is malformed')
    return
  }

  var channel = [
    process.env.REDIS_DNS_INVALIDATION_KEY,
    hostIpMatch.pop()
  ].join(':')
  var localIp = this.container.inspect.NetworkSettings.IPAddress

  log.debug({
    method: 'InstanceSchema.methods.invalidateContainerDNS',
    channel: channel,
    localIp: localIp
  }, 'Container DNS Invalidate event emitted')

  // Publish the invalidate event
  pubsub.publish(channel, localIp)
}

InstanceSchema.methods.setDependenciesFromEnvironment = function (ownerUsername, cb) {
  log.trace({ tx: true }, 'setDependenciesFromEnvironment')
  var self = this
  var originalCb = cb
  cb = function () {
    self.invalidateContainerDNS()
    originalCb.apply(cb, arguments)
  }

  ownerUsername = ownerUsername.toLowerCase()

  async.parallel({
    dependencies: self.getDependencies.bind(self),
    masterInstances: function getNamesFromMongo (cb) {
      var query = {
        lowerName: { $ne: self.lowerName },
        'owner.github': self.owner.github,
        masterPod: true
      }
      Instance.find(query, fieldsForHostname, function (err, instances) {
        if (err) { return cb(err) }
        instances.forEach(function (i) {
          i.hostname = i.getElasticHostname(ownerUsername)
        })
        cb(null, instances)
      })
    }
  }, function (err, results) {
    if (err) { return cb(err) }
    var deps = results.dependencies // existing dependencies
    var masters = results.masterInstances
    // envDeps - dependencies detected in the env
    var envDeps = self.env.map(function (env) {
      var val = env.split('=')[1]
      var instance = find(masters, function (master) {
        // FIXME: find a parse host or hostname strategy
        var re = new RegExp(escapeRegExp(master.hostname), 'i')
        return re.test(val)
      })
      if (instance) {
        // maybe add this dep if doesn't already exist
        var dep = keypather.expand(instance.generateGraphNode().props, '_')
        dep.hostname = instance.hostname // cached above
        return dep
      }
    }).filter(exists)
    // check existing deps, to determine which to add and remove
    var addDeps = []
    var remDeps = deps.slice() // clone
    if (deps.length === 0) {
      // add them all
      addDeps = envDeps
    } else {
      envDeps.forEach(function (envDep) {
        remDeps.forEach(function (remDep, i) {
          if (depsEqual(envDep, remDep)) {
            // don't remove it.
            remDeps.splice(i, 1)
          } else {
            // doesn't exist, so add it.
            addDeps.push(envDep)
          }
        })
      })
    }
    // convert addDeps and remDeps to tasks
    var tasks = addDeps
      .map(toAddTask)
      .concat(
        remDeps.map(toRemTask)
    )

    if (tasks.length) {
      async.parallel(tasks, function (err) {
        cb(err, self)
      })
    } else {
      cb(null, self)
    }
    function toAddTask (dep) {
      return self.addDependency.bind(self, dep, dep.hostname)
    }
    function toRemTask (dep) {
      return self.removeDependency.bind(self, dep)
    }
  })
}
function depsEqual (depA, depB) {
  // we assume deps have the same keys
  var keypaths = [
    'id',
    'shortHash',
    'lowerName',
    'name',
    'hostname',
    'owner.github',
    'contextVersion.context'
  ]
  return keypaths.every(function (keypath) {
    var valA = keypather.get(depA, keypath + '.toString().toLowerCase()')
    var valB = keypather.get(depB, keypath + '.toString().toLowerCase()')
    return valA === valB
  })
}

/**
 * add an edge between the node for `this` instance and a dependent instance
 * @param {object} instance - instance to become a dependent
 * @param {string} hostname - hostname associated with this instance
 * @param {function} cb callback
 */
InstanceSchema.methods.addDependency = function (instance, hostname, cb) {
  var self = this
  var originalCb = cb
  cb = function () {
    self.invalidateContainerDNS()
    originalCb.apply(cb, arguments)
  }

  if (!(instance instanceof Instance)) {
    instance._id = instance.id
    instance = new Instance(instance)
  }
  hostname = hostname.toLowerCase()
  var client = new Graph()
  // we assume that `instance` is in the graph already
  var start = this.generateGraphNode()
  var end = {
    label: 'Instance',
    props: { id: instance.id.toString() }
  }
  var dependencyConnection = {
    label: 'dependsOn',
    props: {
      hostname: hostname
    }
  }
  var connections = [
    [ start, dependencyConnection, end ]
  ]

  async.series([
    // TODO(bryan): remove these `upsertIntoGraph`s after we've migrated everyone in
    self.upsertIntoGraph.bind(self),
    instance.upsertIntoGraph.bind(instance),
    client.graph.writeConnections.bind(client.graph, connections)
  ], function (err) {
    if (err) { return cb(err) }
    var i = pick(instance.toJSON(), [
      'contextVersion',
      'id',
      'lowerName',
      'name',
      'owner',
      'shortHash'
    ])
    // set this as a string for consistency
    i.hostname = hostname
    i.contextVersion = {
      context: i.contextVersion.context.toString()
    }
    cb(null, i)
  })
}

/**
 * remove an instance dependency
 * @param {object} instance - instance to remove as a dependent
 * @param {function} cb callback
 */
InstanceSchema.methods.removeDependency = function (instance, cb) {
  if (!(instance instanceof Instance)) {
    instance._id = instance.id
    instance = new Instance(instance)
  }
  var client = new Graph()
  var start = this.generateGraphNode()
  var end = instance.generateGraphNode()

  var self = this
  var originalCb = cb
  cb = function () {
    self.invalidateContainerDNS()
    originalCb.apply(cb, arguments)
  }

  client.graph.deleteConnection(start, 'dependsOn', end, cb)
}

/**
 * get nodes which depend on this instance
 * @param {function} cb (err, nodeArray, allNodes)
 *                      nodeArray: array of graph node objects
 *                      no dependents return empty array
 *                      allNodes: array of all graph objects in query
 * TODO: make more robust by also checking hostname for depends on
 */
InstanceSchema.methods.getDependents = function (cb) {
  var self = this
  var client = new Graph()
  // hack to get valid starting node if we pass an existing node
  var start = self.generateGraphNode
    ? self.generateGraphNode()
    : { label: 'Instance' }
  if (start.hostname) {
    delete start.hostname
  }

  var steps = [{
    In: {
      edge: { label: 'dependsOn' },
      node: { label: 'Instance' }
    }
  }]
  client.graph.getNodes(start, steps, function (err, nodes, allNodes) {
    if (err) { return cb(err) }
    nodes = fixNodes(nodes, allNodes)
    cb(null, nodes, allNodes)
  })
}

/**
 * get instance dependencies
 * @param {object} params - extra parameters
 * @param {string} params.hostname - search for dependencies that are associated with a hostname
 * @param {function} cb callback
 */
InstanceSchema.methods.getDependencies = function (params, cb) {
  if (isFunction(params)) {
    cb = params
    params = {}
  } else {
    params = clone(params)
  }
  _getDeps(this, [], function (err, deps) {
    if (err) { return cb(err) }
    if (params.flatten) {
      deps = flatten(deps, {})
    }

    // Annotate dependencies with additional instance information (currently
    // only adding network information for charon)
    async.map(deps, function annotateWithInstanceFields (dep, annotateCb) {
      Instance.findById(dep.id, function (err, instance) {
        if (err) { return annotateCb(err) }
        if (exists(instance) && exists(instance.network)) {
          dep.network = instance.network
        }
        annotateCb(null, dep)
      })
    }, function (err, deps) {
      // Need this since tests are expecting null error from callback
      if (err) { return cb(err) }
      cb(null, deps)
    })

    function flatten (depTree, collective) {
      depTree.forEach(function (dep) {
        collective[dep.id] = clone(dep)
        collective[dep.id].dependencies.forEach(function (d) {
          if (d.dependencies) {
            delete d.dependencie
          }
        })
        flatten(dep.dependencies, collective)
      })
      return Object.keys(collective).map(function (k) {
        return collective[k]
      })
    }
  })

  function _getDeps (instance, seenNodes, getDepsCb) {
    var client = new Graph()
    // hack to get valid starting node if we pass an existing node
    var start = instance.generateGraphNode
      ? instance.generateGraphNode()
      : { label: 'Instance', props: { id: instance.id } }
    if (start.hostname) {
      delete start.hostname
    }
    var stepEdge = {
      label: 'dependsOn'
    }
    if (params.hostname) {
      params.hostname = params.hostname.toLowerCase()
      stepEdge.props = { hostname: params.hostname }
    }
    var steps = [{
      Out: {
        edge: stepEdge,
        node: { label: 'Instance' }
      }
    }]
    client.graph.getNodes(start, steps, function (err, nodes, allNodes) {
      if (err) { return getDepsCb(err) }
      /* allNodes:
       * a: Instance (start),
       * b: dependsOn,
       * c: nodes
       */
      nodes = fixNodes(nodes, allNodes)

      if (params.recurse) {
        async.mapSeries(nodes, function (n, mapCb) {
          if (seenNodes.indexOf(n.id) !== -1) {
            mapCb(null)
          } else {
            seenNodes.push(n.id)
            _getDeps(n, seenNodes, function (_err, deps) {
              n.dependencies = deps
              mapCb(_err, n)
            })
          }
        }, function (mapErr, results) {
          getDepsCb(mapErr, results.filter(exists))
        })
      } else {
        getDepsCb(null, nodes)
      }
    })
  }
}

/**
 * fixes keys on node to match out instance objects
 * @param  {object} nodes    array of nodes returned from graph.getNodes
 * @param  {object} allNodes array of allNodes returned from graph.getNodes
 * @return {object}          array of nodes with keys fixed
 */
function fixNodes (nodes, allNodes) {
  var hostnames = allNodes.b
  // fix owner_github -> owner.github
  // fix contextVersion_context -> contextVersion.context
  var fixes = {
    'owner_github': 'owner.github', // eslint-disable-line quote-props
    'contextVersion_context': 'contextVersion.context' // eslint-disable-line quote-props
  }
  nodes.forEach(function (n, i) {
    // set hostnames (from the edges) on the nodes
    keypather.set(n, 'hostname', hostnames[i].hostname)
    Object.keys(fixes).forEach(function (key) {
      if (keypather.get(n, key) && !keypather.get(n, fixes[key])) {
        keypather.set(n, fixes[key], n[key])
        delete n[key]
      }
    })
  })
  return nodes
}

/**
 * find all master instances that use specific repo and when
 * `branch` doesn't equal to the masterPod branch.
 * We only care about main repos (additionalRepo=false)
 * @param  {String}   repo   full repo name (username/reponame)
 * @param  {String}   branch branch name
 * @param  {Function} cb     callback
 */
InstanceSchema.statics.findForkableMasterInstances = function (repo, branch, cb) {
  log.trace({
    tx: true,
    repo: repo,
    branch: branch
  }, 'findForkableMasterInstances')
  var query = {
    masterPod: true,
    'contextVersion.appCodeVersions': {
      $elemMatch: {
        lowerRepo: repo.toLowerCase(),
        lowerBranch: { $ne: branch.toLowerCase() },
        $or: [
          { additionalRepo: false },
          { additionalRepo: { $exists: false } }
        ]
      }
    }
  }
  Instance.find(query, cb)
}

/**
 * find all instances that have `parent` = `shortHash`. will fetched only
 * autoForked instances.
 * @param  {String}   shortHash   shortHash of a parent instance used for search
 * @param  {Function} cb     callback
 */
InstanceSchema.statics.findInstancesByParent = function (shortHash, cb) {
  log.trace({
    tx: true,
    shortHash: shortHash
  }, 'findInstancesByParent')
  Instance.find({ autoForked: true, parent: shortHash }, cb)
}

/**
 * returns parent of this instance (should be masterPod)
 * @param  {Function} cb (err, parentInstance)
 */
InstanceSchema.methods.getParent = function (cb) {
  log.trace({
    tx: true,
    parent: this.parent
  }, 'getParent')
  Instance.findOneByShortHash(this.parent, cb)
}

/**
 * find all forked instances that use specific repo and branch
 * @param  {String}   repo   full repo name (username/reponame)
 * @param  {String}   branch branch name
 * @param  {Function} cb     callback
 * @returns {null} null
 */
InstanceSchema.statics.findForkedInstances = function (repo, branch, cb) {
  log.trace({
    tx: true,
    repo: repo,
    branch: branch
  }, 'findForkedInstances')
  if (!repo && !branch) {
    return cb(null)
  }
  var query = {
    masterPod: false,
    autoForked: true,
    'contextVersion.appCodeVersions': {
      $elemMatch: {
        lowerRepo: repo.toLowerCase(),
        lowerBranch: branch.toLowerCase(),
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
 * find all instances that use specific repo and branch.
 * We only care about main repos (additionalRepo=false)
 * @param  {String}   repo   full repo name (username/reponame)
 * @param  {String}   branch branch name
 * @param  {Function} cb     callback
 */
InstanceSchema.statics.findInstancesLinkedToBranch = function (repo, branch, cb) {
  log.trace({
    tx: true,
    repo: repo,
    branch: branch
  }, 'findInstancesLinkedToBranch')
  var query = {
    'contextVersion.appCodeVersions': {
      $elemMatch: {
        lowerRepo: repo.toLowerCase(),
        lowerBranch: branch.toLowerCase(),
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
 * Updates all instances matching on the context version id with key/value pairs from the object passed in
 * @param contextVersionId - Context version to update
 * @param objToSetOnContextVersion - An object containing key value pairs that
 *        match to key value pairs on the contextVersion
 * @param cb - Callback
 */
InstanceSchema.statics.updateContextVersion = function (contextVersionId, objToSetOnContextVersion, cb) {
  log.info({
    tx: true,
    contextVersionId: contextVersionId,
    objToSetOnContextVersion: objToSetOnContextVersion
  }, 'InstanceSchema.statics.updateContextVersion')
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
 * @param  {Function} cb callback
 */
InstanceSchema.methods.updateCv = function (cb) {
  log.trace({
    tx: true
  }, 'updateCv')
  var self = this
  ContextVersion.findById(this.contextVersion._id, { 'build.log': 0 }, function (err, cv) {
    if (err) { return cb(err) }
    self.update({
      $set: { contextVersion: cv.toJSON() }
    }, function (updateErr) {
      self.contextVersion = cv.toJSON()
      cb(updateErr, self)
    })
  })
}

/**
 * populate build, cv, and dependencies for responses
 * @param {Function} cb callback
 */
InstanceSchema.methods.populateModels = function (cb) {
  log.info({
    tx: true
  }, 'InstanceSchema.methods.populateModels')
  var self = this

  var container = this.container || {}
  var noInspectData = !container.inspect || container.inspect.error
  if (container.dockerContainer && noInspectData) {
    return cb(Boom.badRequest('instance missing inspect data'))
  }
  var count = createCount(2, callback)
  self.populate('build', count.next)
  self.updateCv(count.next)

  function callback (_err) {
    if (_err) { return cb(_err) }
    var json = self.toJSON()
    // NOTE: for some reason empty dependencies becomes null after toJSON ? mongoose.
    // json.dependencies = json.dependencies || {}
    cb(null, json)
  }
}

/**
 * Inspect container and update `container.dockerHost`, `container.dockerContainer`,
 * `container.inspect` and `container.ports` fields in database.
 * @param {function} cb callback
 */
InstanceSchema.methods.inspectAndUpdate = function (cb) {
  log.trace({ tx: true }, 'inspectAndUpdate')
  var self = this
  var docker = new Docker(process.env.SWARM_HOST)
  var containerId = self.container.dockerContainer

  docker.inspectContainer(containerId, function (err, inspect) {
    if (err) {
      error.log(err)
      self.modifyContainerInspectErr(containerId, err, function (err2, instance) {
        if (err2) { return cb(err2) }
        cb(null, instance)
      })
    } else {
      self.modifyContainerInspect(containerId, inspect, cb)
    }
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
    'contextVersion._id': toObjectId(contextVersionId)
  }
  var setData = {
    container: {
      error: pick(err, [ 'message', 'stack', 'data' ])
    }
  }
  var logData = {
    tx: true,
    contextVersionId: contextVersionId,
    err: err,
    query: query,
    setData: setData
  }
  log.trace(logData, 'InstanceSchema.methods.modifyContainerCreateErr')
  if (!err || Object.keys(err).length === 0) {
    log.error(logData, 'InstanceSchema.methods.modifyContainerCreateErr err was not provided')
    return cb(Boom.badImplementation('Create container error was not defined'))
  }
  // Note: update instance only if cv (build) has not changed (not patched)
  var self = this
  Instance.findOneAndUpdate(query, {
    $set: setData
  }, function (updateErr, instance) {
    if (updateErr) {
      log.error(put({
        updateErr: updateErr
      }, logData), 'modifyContainerCreateErr Instance.findOneAndUpdate error')
      return cb(updateErr)
    }
    if (!instance) {
      log.warn(logData, 'modifyContainerCreateErr Instance.findOneAndUpdate !instance')
      // just log this secondary error, this route is already errored
      error.log(Boom.conflict("Container error was not set, instance's cv has changed"), logData)
      return cb(null, self)
    }
    log.trace(logData, 'modifyContainerCreateErr Instance.findOneAndUpdate success')
    cb(null, instance)
  })
}

/**
 * findAndModify instance 'container.inspect' by _id and dockerContainer and update
 *   only updates the instance if the container has not changed
 * @param {string} dockerContainer - docker container id (which the inspect info is from)
 * @param {object} containerInspect - container inspect result
 * @param {function} cb - callback
 */
InstanceSchema.methods.modifyContainerInspect = function (dockerContainer, containerInspect, cb) {
  var logData = {
    tx: true,
    dockerContainer: dockerContainer,
    containerInspect: containerInspect
  }
  log.info(logData, 'InstanceSchema.methods.modifyContainerInspect')

  // Any time the inspect data is to be updated we need to ensure the old
  // DNS entries for this container have been invalidated on the charon cache.
  this.invalidateContainerDNS()

  var query = {
    _id: this._id,
    'container.dockerContainer': dockerContainer
  }
  // Note: inspect may have keys that contain dots.
  //  Mongo does not support dotted keys, so we remove them.
  var $set = {
    'container.inspect': removeDottedKeys(containerInspect)
  }
  // don't override ports if they are undefined
  // so that hosts can be cleaned up
  var ports = keypather.get(containerInspect, 'NetworkSettings.Ports')
  if (ports) {
    $set['container.ports'] = ports
  }
  Instance.findOneAndUpdate(query, { $set: $set }, function (err, instance) {
    if (err) {
      log.error(put({
        err: err,
        query: $set
      }, logData), 'InstanceSchema.methods.modifyContainerInspect error')
      return cb(err)
    }
    if (!instance) { // changed or deleted
      log.error(put({ query: $set }, logData),
        'InstanceSchema.methods.modifyContainerInspect error instance not found')
      return cb(Boom.conflict("Container was not deployed, instance's container has changed"))
    }
    log.trace(put({ query: $set },
      logData), 'InstanceSchema.methods.modifyContainerInspect success')
    cb(null, instance)
  })
}

/**
 * update container inspect information
 *   only updates the instance if the container has not changed
 * @param  {string}   dockerContainer docker container id
 * @param  {Error}   err inspect error
 * @param  {Function} cb  callback
 */
InstanceSchema.methods.modifyContainerInspectErr = function (dockerContainer, err, cb) {
  log.trace({
    tx: true,
    dockerContainer: dockerContainer,
    err: err
  }, 'modifyContainerInspectErr')
  // Note: update instance only if cv (build) has not changed (not patched)
  var query = {
    _id: this._id,
    'container.dockerContainer': dockerContainer
  }
  var self = this
  Instance.findOneAndUpdate(query, {
    $set: {
      'container.inspect.error': pick(err, [ 'message', 'stack', 'data' ])
    }
  }, function (updateErr, instance) {
    if (updateErr) {
      cb(updateErr)
    } else if (!instance) {
      // just log this secondary error, this route is already errored
      error.log(Boom.conflict("Container error was not set, instance's container has changed"))
      cb(null, self)
    } else {
      cb(updateErr, instance)
    }
  })
  // log the inspect error
  error.log(err)
}

/**
 * update container inspect if start & stop request errors
 * removes optimistic set "starting" or "stopping" property
 * @param {Function} cb Callback function
 */
InstanceSchema.methods.removeStartingStoppingStates = function (cb) {
  log.trace({
    tx: true,
    instanceId: this._id,
    instanceName: this.name
  }, 'InstanceSchema.methods.removeStartingStoppingStates')
  Instance.findOneAndUpdate({
    _id: this._id
  }, {
    $unset: {
      'container.inspect.State.Starting': 1,
      'container.inspect.State.Stopping': 1
    }
  }, function (updateErr, instance) {
    if (updateErr) {
      log.error({
        tx: true,
        err: updateErr
      }, 'InstanceSchema.methods.removeStartingStoppingStates findOneAndUpdate error')
      return cb(updateErr)
    }
    log.trace({
      tx: true,
      instance: instance
    }, 'InstanceSchema.methods.removeStartingStoppingStates findOneAndUpdate success')
    cb(updateErr)
  })
}

/** Check to see if a instance is public.
 *  @param {function} [cb] function (err, {@link module:models/instance Instance}) */
InstanceSchema.methods.isPublic = function (cb) {
  log.trace({
    tx: true
  }, 'isPublic')
  var err
  if (!this.public) {
    err = Boom.forbidden('Instance is private')
  }
  cb(err, this)
}
/**
 * update instance.contextVersion to latest by context version ids
 * note: instance.emitInstanceUpdate will populate and update out-of-sync contextVersions
 * @param  {User} sessionUser
 * @param  {Object} query instance query
 * @param  {String} action type of update (for messenger)
 * @param  {Function} cb callback
 */
InstanceSchema.statics.emitInstanceUpdates = function (sessionUser, query, action, cb) {
  var logData = {
    tx: true,
    sessionUser: toJSON(sessionUser),
    query: query,
    action: action
  }
  log.info(logData, 'InstanceSchema.statics.emitInstanceUpdates')
  this.find(query, function (err, instances) {
    if (err) {
      log.error(
        put({ err: err }, logData),
        'emitInstanceUpdates: InstanceSchema.findBy contextVersion._id failure'
      )
      return cb(err)
    }
    log.trace(
      put({ instances: instances.map(toJSON) }, logData),
      'emitInstanceUpdates: InstanceSchema.findBy contextVersion._id failure'
    )
    async.map(instances, function (instance, cb) {
      instance.emitInstanceUpdate(sessionUser, action, cb)
    }, cb)
  })
}

/**
 * emit instance update event for instance on primus
 * note: this will populate and update out-of-sync contextVersion
 * @param  {User}     sessionUser
 * @param  {String} action type of update (for messenger)
 * @param  {Function} cb       callback
 */
InstanceSchema.methods.emitInstanceUpdate = function (sessionUser, action, cb) {
  var self = this
  async.parallel([
    self.populateModels.bind(self),
    self.populateOwnerAndCreatedBy.bind(self, sessionUser)
  ], function (err) {
    if (err) { return cb(err) }
    messenger.emitInstanceUpdate(self, action)
    cb(null, self)
  })
}

/**
 * set image pull information atomically
 * @param {ObjectId|String} cvId context version id, should match contextVersion._id on instance
 * @param {Object} imagePull
 * @param {String} imagePull.dockerTag docker tag of the image being pulled
 * @param {String} imagePull.dockerHost docker host where the image is being pulled
 * @param {String} imagePull.ownerUsername instance owner username - this is needed in image-pulled worker
 * @param {Object} image.sessionUser
 * @param {String} image.sessionUser.github session user github id
 * @param {Function} cb callback(err, instance)
 */
InstanceSchema.methods.modifyImagePull = function (cvId, imagePull, cb) {
  imagePull._id = new ObjectId()
  var schema = joi.object({
    _id: joi.objectId().required(),
    dockerTag: joi.string().required(),
    dockerHost: joi.string().required()
  }).required().unknown()
  joi.validateOrBoom(imagePull, schema, function (err) {
    if (err) { return cb(err) }
    Instance.findOneAndUpdate({
      'contextVersion._id': toObjectId(cvId)
    }, {
      $set: {
        imagePull: imagePull
      }
    }, cb)
  })
}

/**
 * unset image pull information atomically
 *
 */
InstanceSchema.methods.modifyUnsetImagePull = function (imagePullId, cb) {
  Instance.findOneAndUpdate({
    'imagePull._id': toObjectId(imagePullId)
  }, {
    $unset: {
      imagePull: 1
    }
  }, cb)
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
