/**
 * Instance service performs more complex actions related to the instances.
 * The service interacts not only with DB models but with other systems like
 * job queue.
 * @module lib/models/services/instance-service
 */

'use strict'

var assign = require('101/assign')
var error = require('error')
var put = require('101/put')
var async = require('async')
var Boom = require('dat-middleware').Boom
var Docker = require('models/apis/docker')
var equalObjectIds = require('utils/equal-object-ids')
var map = require('object-loops/map')
var ContextVersion = require('models/mongo/context-version')
var Instance = require('models/mongo/instance')
var keypather = require('keypather')()
var log = require('middlewares/logger')(__filename).log
var rabbitMQ = require('models/rabbitmq')
var toJSON = require('utils/to-json')
var joi = require('utils/joi')
var formatObjectForMongo = require('utils/format-object-for-mongo')
var Promise = require('bluebird')
var messenger = require('socket/messenger')
var User = require('models/mongo/user')

function InstanceService () {}

module.exports = InstanceService

/**
 * Find all forked instances that has specific main repo and branch deployed and
 * create `instance.delete` job for each of the found instances.
 * @param {String} instanceId - this instance is the original. Shouldn't be deleted
 * @param {String} repo - repo name used for the instances search
 * @param {String} branch - branch name used for the instances search
 * @param {Fucntion} cb - standard Node.js callback
 */
InstanceService.prototype.deleteForkedInstancesByRepoAndBranch = function (instanceId, repo, branch, cb) {
  var logData = {
    tx: true,
    instanceId: instanceId,
    repo: repo,
    branch: branch
  }
  log.info(logData, 'InstanceService.prototype.deleteForkedInstancesByRepoAndBranch')
  // do nothing if parameters are missing
  if (!instanceId || !repo || !branch) {
    log.warn(logData, 'InstanceService.prototype.deleteForkedInstancesByRepoAndBranch quit')
    return cb()
  }
  Instance.findForkedInstances(repo, branch, function (err, instances) {
    if (err) {
      log.error(put({ err: err }, logData),
        'InstanceService.prototype.deleteForkedInstancesByRepoAndBranch')
      return cb(err)
    }
    if (instances) {
      var instancesToDelete = instances.filter(function (inst) {
        return inst._id.toString() !== instanceId.toString()
      })
      instancesToDelete.forEach(function (inst) {
        rabbitMQ.deleteInstance({
          instanceId: inst._id
        })
      })
    }
    cb()
  })
}

/**
 * Delete all forked instances from the `instance`.
 * Create `instance.delete` job for each of the found instances.
 * @param {Object} instance - instance which forks we should delete
 * @return {Promise}
 * @resolve {(Object|Array.)} array fork instances
 */
InstanceService.deleteAllInstanceForks = function (instance) {
  var logData = {
    tx: true,
    instance: instance
  }
  log.info(logData, 'InstanceService.deleteAllInstanceForks')
  if (!instance.masterPod) {
    // return empty array since nothing was deleted
    log.trace(logData, 'deleteAllInstanceForks nothing to delete')
    return Promise.resolve([])
  }
  return Instance.findInstancesByParentAsync(instance.shortHash)
    .then(function (instances) {
      instances.forEach(function (fork) {
        rabbitMQ.deleteInstance({
          instanceId: fork._id
        })
      })
      return instances
    })
}

/**
 * create a user container for an instance
 * @param  {Object}   opts
 * @param  {ObjectId|String} opts.instanceId       id of instance to create container for
 * @param  {ObjectId|String} opts.contextVersionId id of contextVersion (image) to create container
 * @param  {String}   opts.ownerUsername    instance owner's username
 * @param  {Function} cb                    callback
 */
InstanceService.createContainer = function (opts, cb) {
  var logData = {
    tx: true,
    opts: opts
  }
  log.info(logData, 'InstanceService.createContainer')
  async.waterfall([
    function validateOpts (cb) {
      joi.validateOrBoom(opts, joi.object({
        instanceId: joi.objectId().required(),
        contextVersionId: joi.objectId().required(),
        ownerUsername: joi.string().required(),
        sessionUserGithubId: joi.any().required()
      }).unknown().required(), cb)
    },
    InstanceService._findInstanceAndContextVersion,
    function (mongoData, cb) {
      var createOpts = assign(mongoData, opts)
      InstanceService._createDockerContainer(createOpts, function (err, container) {
        if (err) { return cb(err) }
        mongoData.contextVersion.handleRecovery(function (err) {
          if (err) { return cb(err) }
          cb(null, container)
        })
      })
    }
  ], cb)
}

/**
 * find one instance and one contextVersion by ids
 * @param  {Object}          opts
 * @param  {ObjectId|String} opts.instanceId instance id
 * @param  {ObjectId|String} opts.contextVersionId context version id
 * @param  {Function} cb     callback
 */
InstanceService._findInstanceAndContextVersion = function (opts, cb) {
  var logData = {
    tx: true,
    opts: opts
  }
  log.info(logData, 'InstanceService._findInstanceAndContextVersion')
  var instanceId = opts.instanceId
  var contextVersionId = opts.contextVersionId
  async.parallel({
    instance: Instance.findById.bind(Instance, instanceId),
    contextVersion: ContextVersion.findById.bind(ContextVersion, contextVersionId)
  }, function (err, data) {
    if (err) {
      log.error(put(logData, { err: err }), 'InstanceService._findInstanceAndContextVersion dbErr')
      return cb(err)
    }
    err = validateMongoData(data)
    if (err) {
      log.error(put(logData, { err: err }),
        'InstanceService._findInstanceAndContextVersion validationErr')
      return cb(err)
    }
    log.trace(put(logData, { data: data }),
      'InstanceService._findInstanceAndContextVersion success')
    cb(null, data)
  })
  /**
   * validate mongo data
   * @return {Error|undefined} validation error if it exists
   */
  function validateMongoData (data) {
    var err
    if (!data.instance) {
      err = Boom.notFound('Instance not found', opts)
    } else if (!data.contextVersion) {
      err = Boom.notFound('ContextVersion not found', opts)
    } else if (!equalObjectIds(data.instance.contextVersion._id, data.contextVersion._id)) {
      err = Boom.conflict("Instance's contextVersion has changed", opts)
    }
    return err
  }
}

/**
 * create docker container for instance and cv
 * @param  {String}   ownerUsername instance owner username
 * @param  {Object}   opts     [description]
 * @param  {Object}   opts.instance instance which the container belongs
 * @param  {Object}   opts.contextVersion contextVersion's image
 * @param  {Object}   opts.ownerUsername instance owner's username
 * @param  {Object}   opts.sessionUserGithubId session user's github id
 * @param  {Function} cb            callback
 */
InstanceService._createDockerContainer = function (opts, cb) {
  var logData = {
    tx: true,
    ownerUsername: opts.ownerUsername,
    opts: map(opts, toJSON) // toJSON mongo docs before logging.
  }
  var self = this
  log.info(logData, 'InstanceService._createDockerContainer')
  var instance = opts.instance
  var contextVersion = opts.contextVersion

  log.info(logData, 'InstanceService._createDockerContainer createDockerContainer')
  var docker = new Docker()
  docker.createUserContainer(opts, function (err, container) {
    if (error.is4XX(err)) {
      // handle "image not found" error as a special case
      if (Docker.isImageNotFoundForCreateErr(err)) {
        log.error(put(logData, { err: err }),
          'InstanceService._createDockerContainer finalCallback "image not found" error')
        return self._handleImageNotFoundErr(opts, err, cb)
      }
      // 4XX errs are not retryable, so mark db state
      log.error(put(logData, { err: err }),
        'InstanceService._createDockerContainer finalCallback error')
      instance.modifyContainerCreateErr(contextVersion._id, err, function (err2) {
        if (err2) {
          log.error(put(logData, { err: err2 }),
            'InstanceService._createDockerContainer finalCallback db error')
        }
        // if db write is successful, callback 4XX error
        // if db write was unsuccessful (err2), then callback err2 (500 error)
        cb(err2 || err)
      })
    } else if (err) { // 5XX err (non 4XX err)
      log.trace(put(logData, { err: err }), 'InstanceService._createDockerContainer finalCallback 5XX error')
      cb(err)
    } else {
      log.trace(logData, 'InstanceService._createDockerContainer finalCallback success')
      cb(null, container)
    }
  })
}

/**
 * handle pull "image not found" error
 * @param  {Error}   err image-not-found error
 * @param  {Function} cb  callback
 */
InstanceService._handleImageNotFoundErr = function (opts, err, cb) {
  var logData = {
    tx: true,
    ownerUsername: opts.ownerUsername,
    opts: map(opts, toJSON), // toJSON mongo docs before logging.
    err: err
  }
  log.info(logData, 'InstanceService._handleImageNotFoundErr')
  var instance = opts.instance
  try {
    rabbitMQ.pullInstanceImage({
      instanceId: instance._id,
      buildId: instance.build,
      sessionUserGithubId: opts.sessionUserGithubId,
      ownerUsername: opts.ownerUsername
    })
  } catch (dataErr) {
    log.error(put(logData, { err: dataErr }),
      'InstanceService._createDockerContainer handleImageNotFoundErr data validation error')
    return cb(dataErr) // validation error, 400
  }
  return cb(err) // pass-through original 404 err
}

/**
 * Modifies instance container with docker inspect data
 * Clears any potentially hazard in the set object that could cause mongo errors
 * @param  {Object}   query     - query to find matching instances to update
 * @param  {Object}   setObject - object set as the $set value of the mongo update
 * @param  {Function} cb        - standard Node.js callback
 */
InstanceService.prototype.updateContainerInspect = function (query, setObject, cb) {
  var logData = {
    tx: true,
    query: query,
    setObject: setObject
  }
  log.info(logData, 'InstanceSchema.statics.modifyContainerInspect')
  // Note: inspect may have keys that contain dots.
  //  Mongo does not support dotted keys, so we remove them.

  // We don't want the base keys to be formatted because $set can take root-level dots
  Object.keys(setObject).forEach(function (key) {
    formatObjectForMongo(setObject[key])
  })
  Instance.findOneAndUpdate(query, { $set: setObject }, function (err, instance) {
    if (err) {
      log.error(put({
        err: err,
        query: setObject
      }, logData), 'InstanceSchema.statics.modifyContainerInspect error')
      return cb(err)
    }
    if (!instance) { // changed or deleted
      log.error(put({ query: setObject }, logData),
        'InstanceSchema.statics.modifyContainerInspect error instance not found')
      return cb(Boom.conflict("Container was not updated, instance's container has changed"))
    }
    log.trace(put({ query: setObject },
      logData), 'InstanceSchema.statics.modifyContainerInspect success')
    cb(null, instance)
  })
}
/**
 * Modifies instance container with docker inspect data and, optionally, adds weave/network IP.
 * Invalidates charon cache
 * @param  {Object}   instance         - instance that should be updated
 * @param  {String}   containerId      - docker container id
 * @param  {Object}   containerInspect - docker inspect data
 * @param  {String}   containerIp      - (optional) docker container ip address
 * @param  {Function} cb               - standard Node.js callback
 */
InstanceService.prototype.modifyExistingContainerInspect =
  function (instance, containerId, containerInspect, containerIp, cb) {
    var logData = {
      tx: true,
      instanceId: instance._id,
      containerId: containerId,
      containerInspect: containerInspect
    }
    if (typeof containerIp === 'function') {
      cb = containerIp
      containerIp = null
    } else {
      logData.containerIp = containerIp
    }
    // Any time the inspect data is to be updated we need to ensure the old
    // DNS entries for this container have been invalidated on the charon cache.
    instance.invalidateContainerDNS()
    // in case container_start event was processed check dockerContainer
    // otherwise dockerContainer would not exist
    var query = {
      _id: instance._id,
      'container.dockerContainer': containerId
    }
    log.info(logData, 'InstanceService.prototype.modifyContainerInspect')
    // don't override ports if they are undefined
    // so that hosts can be cleaned up
    var $set = {
      'container.inspect': containerInspect
    }
    if (containerIp) {
      $set['network.hostIp'] = containerIp
    }
    var ports = keypather.get(containerInspect, 'NetworkSettings.Ports')
    if (ports) {
      $set['container.ports'] = ports
    }
    this.updateContainerInspect(query, $set, cb)
  }

/**
 * Try to start instance.
 * 1) Check if instance is starting or stopping.
 * 2) Create start instance task or redeploy if instance was migrated
 * 3) Set Instance into starting state
 * @param {Instance} instance - Instance model we are updating
 * @param {Number} sessionUserGithubId - github id of the session user
 * @returns {Promise}
 */
InstanceService.startInstance = function (instance, sessionUserGithubId) {
  var logData = {
    tx: true,
    instance: instance,
    sessionUserGithubId: sessionUserGithubId
  }
  log.info(logData, 'InstanceService.startInstance')
  return new Promise(function (resolve) {
    var containerId = keypather.get(instance, 'container.dockerContainer')
    if (!containerId) {
      throw Boom.badRequest('Instance does not have a container')
    }
    resolve()
  })
  .then(function () {
    log.trace(logData, 'startInstance check state')
    return instance.isNotStartingOrStoppingAsync()
  })
  .then(function () {
    if (instance.contextVersion.dockRemoved) {
      log.trace(logData, 'startInstance redeploy')
      rabbitMQ.redeployInstanceContainer({
        instanceId: instance._id,
        sessionUserGithubId: sessionUserGithubId
      })
    } else {
      log.trace(logData, 'startInstance start')
      rabbitMQ.startInstanceContainer({
        dockerContainer: instance.container.dockerContainer,
        dockerHost: instance.container.dockerHost,
        instanceId: instance._id.toString(),
        ownerUsername: instance.owner.username,
        sessionUserGithubId: sessionUserGithubId,
        tid: keypather.get(process.domain, 'runnableData.tid.toString()')
      })
    }
    return
  })
  .then(function () {
    log.trace(logData, 'startInstance mark as starting')
    return instance.setContainerStateToStartingAsync()
  })
}

/**
 * Populates the models and owner/created by in the instance and emits the right event
 * @param {Instance} instance - Instance model we are updating
 * @param {Number} userGithubId - Github ID we should use to populate models, if null uses instance.createdBy.github
 * @param {String} eventName - Event Name to emit
 * @param {Boolean} forceCvRefresh - If true will force a refresh of the context version
 * @returns {Promise}
 */
InstanceService.emitInstanceUpdate = function (instance, userGithubId, eventName, forceCvRefresh) {
  userGithubId = userGithubId || keypather.get(instance, 'createdBy.github')
  var logData = {
    tx: true,
    userGithubId: userGithubId,
    instance: instance,
    forceCvRefresh: forceCvRefresh
  }
  log.info(logData, 'InstanceService.emitInstanceUpdate')
  return User.findByGithubIdAsync(userGithubId)
    .then(function (user) {
      var populationPromises = [
        instance.populateModelsAsync(),
        instance.populateOwnerAndCreatedByAsync(user)
      ]
      if (forceCvRefresh) {
        populationPromises.push(instance.updateCvAsync())
      }
      return Promise.all(populationPromises)
    })
    .then(function () {
      messenger.emitInstanceUpdate(instance, eventName)
    })
}
