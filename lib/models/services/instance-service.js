/**
 * Instance service performs more complex actions related to the instances.
 * The service interacts not only with DB models but with other systems like
 * job queue.
 * @module lib/models/services/instance-service
 */

'use strict'

var Promise = require('bluebird')
var assign = require('101/assign')
var put = require('101/put')
var map = require('object-loops/map')
var error = require('error')
var async = require('async')
var uuid = require('node-uuid')
var removeDottedKeys = require('remove-dotted-keys')
var Boom = require('dat-middleware').Boom
var keypather = require('keypather')()

var log = require('middlewares/logger')(__filename).log
var Docker = require('models/apis/docker')
var ContextVersion = require('models/mongo/context-version')
var Instance = require('models/mongo/instance')
var Build = require('models/mongo/build')
var rabbitMQ = require('models/rabbitmq')

var toObjectId = require('utils/to-object-id')
var toJSON = require('utils/to-json')
var equalObjectIds = require('utils/equal-object-ids')
var joi = require('utils/joi')

function InstanceService () {}

module.exports = InstanceService

/**
 * Find all forked instances that has specific main repo and branch deployed and
 * create `delete-instance` job for each of the found instances.
 * @param instanceId - this instance is the original. Shouldn't be deleted
 * @param userId - user that should perform instance deletion action
 * @param repo - repo name used for the instances search
 * @param branch - branch name used for the instances search
 * @param cb - standard Node.js callback
 */
InstanceService.prototype.deleteForkedInstancesByRepoAndBranch = function (instanceId, userId, repo, branch, cb) {
  var logData = {
    tx: true,
    instanceId: instanceId,
    userId: userId,
    repo: repo,
    branch: branch
  }
  log.info(logData, 'InstanceService.prototype.deleteForkedInstancesByRepoAndBranch')
  // do nothing if parameters are missing
  if (!instanceId || !userId || !repo || !branch) {
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
          instanceId: inst._id,
          instanceName: inst.name,
          sessionUserId: userId
        })
      })
    }
    cb()
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
      InstanceService._createDockerContainer(createOpts, cb)
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
      log.error(put(logData, {err: err}), 'InstanceService._findInstanceAndContextVersion dbErr')
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
  var docker = new Docker(process.env.SWARM_HOST)
  docker.createUserContainer(opts, function (err, container) {
    // Handle "image not found" error as a special case
    // This might be a 400x or a 500x error
    if (err) {
      var opts = map({orriginalErr: err, message: err.message, imageNotFound: Docker.isImageNotFoundForCreateErr(err)}, toJSON)
      log.info(put(logData, {opts: opts}), 'InstanceService._createDockerContainer errorCreatingContainer')
    }
    if (Docker.isImageNotFoundForCreateErr(err)) {
      log.error(put(logData, { err: err }),
        'InstanceService._createDockerContainer finalCallback "image not found" error')
      return self._handleImageNotFoundErr(opts, err).asCallback(cb)
    }
    if (error.is4XX(err)) {
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
 * Handle pull "image not found" error
 * @param  {Object} opts
 * @param  {Instance} opts.instance - Instance model instance
 * @param  {ContextVersion} opts.contextVersion - ContextVersion model instance
 * @param  {String} opts.ownerUsername - Github username of creator
 * @param  {Number} opts.sessionUserGithubId - Github ID of creator
 * @param  {Object} opts.data
 * @param  {String} opts.data.tid - UUID for job
 * @param  {Error}  err - Error thrown by `createContainer` when the image is not found
 * @param  {Promise}
 */
InstanceService._handleImageNotFoundErr = function (opts, err) {
  var logData = {
    tx: true,
    ownerUsername: opts.ownerUsername,
    opts: map(opts, toJSON), // toJSON mongo docs before logging.
    err: err
  }
  log.info(logData, 'InstanceService._handleImageNotFoundErr')
  var instance = opts.instance
  var contextVersion = opts.contextVersion
  return Promise.all([
    instance,
    contextVersion,
    Build.findOneAsync({
      _id: toObjectId(instance.build)
    })
  ])
  .spread(function createImageBuilderContainerJobIfBuiltCompleted (instance, contextVersion, build) {
    if (build.completed || build.failed) {
      // If build has already been built...
      // Enqueue `createImageBuild` job again and return job as successful
      log.info(
        put(logData, { instance: toJSON(instance) }),
        'onInstanceImagePull.createImageBuilderContainerJobIfBuiltCompleted')
      return rabbitMQ.createImageBuilderContainer({
        manualBuild: false, // What is a manual build? Triggered by the user?
        sessionUserGithubId: opts.sessionUserGithubId,
        ownerUsername: opts.ownerUsername,
        contextId: contextVersion.context.toString(),
        contextVersionId: contextVersion._id.toString(),
        noCache: true, // Don't use the cache
        tid: keypather.get(opts, 'data.tid') || uuid.v4()
      })
    }
    // Container is still building
    return null
  })
  .catch(function (jobError) {
    log.error(put(logData, { err: jobError }),
      'InstanceService._createDockerContainer handleImageNotFoundErr data validation/job enqueing error')
    throw jobError
  })
  .then(function (response) {
    if (response === null) {
      // Container is still building
      // Throw error the original error in order for this task to be re-enqueued
      throw err
    }
    // If there is not error when the job executes and a new job was re-enqueued
    // successfully, return a success response
    return response
  })
}

/**
 * Modifies instance container with docker inspect data and also adds weave/network IP.
 * Invalidates charon cache
 * @param instance - instance that should be updates
 * @param containerId - docker container id
 * @param containerIp - docker container weave IP
 * @param containerInspect - docker inspect data
 * @param cb - standard Node.js callback
 */
InstanceService.prototype.updateOnContainerStart =
  function (instance, containerId, containerIp, containerInspect, cb) {
    var logData = {
      tx: true,
      instanceId: instance._id,
      containerId: containerId,
      containerIp: containerIp,
      containerInspect: containerInspect
    }
    log.info(logData, 'InstanceService.prototype.updateOnContainerStart')
    // Any time we receive new weave ip address
    // DNS entries for this container have been invalidated on the charon cache.
    instance.invalidateContainerDNS()
    // in case container_start event was processed check dockerContainer
    // otherwise dockerContainer wouldn't not exist
    var query = {
      _id: instance._id,
      'container.dockerContainer': containerId
    }
    // Note: inspect may have keys that contain dots.
    //  Mongo does not support dotted keys, so we remove them.
    var $set = {
      'network.hostIp': containerIp,
      'container.inspect': removeDottedKeys(containerInspect)
    }

    // don't override ports if they are undefined
    // so that hosts can be cleaned up
    var ports = keypather.get(containerInspect, 'NetworkSettings.Ports')
    if (ports) {
      $set['container.ports'] = ports
    }
    Instance.findOneAndUpdate(query, { $set: $set }, function (err, updatedInstance) {
      if (err) {
        log.error(put({
          err: err
        }, logData), 'InstanceService.prototype.updateOnContainerStart err')
        return cb(err)
      }
      if (!updatedInstance) { // changed or deleted
        log.error(logData,
          'InstanceService.prototype.updateOnContainerStart error instance not found')
        return cb(Boom.conflict("Container IP was not updated, instance's container has changed"))
      }
      log.trace(logData, 'InstanceService.prototype.updateOnContainerStart success')
      cb(null, updatedInstance)
    })
  }

/**
 * Modifies instance container with docker inspect data
 * Invalidates charon cache
 * @param instance - instance that should be updates
 * @param containerId - docker container id
 * @param containerInspect - docker inspect data
 * @param cb - standard Node.js callback
 */
InstanceService.prototype.updateOnContainerDie =
  function (instance, containerId, containerInspect, cb) {
    var logData = {
      tx: true,
      instanceId: instance._id,
      containerId: containerId,
      containerInspect: containerInspect
    }
    log.info(logData, 'InstanceService.prototype.updateOnContainerDie')
    // Any time we receive new weave ip address
    // DNS entries for this container have been invalidated on the charon cache.
    instance.invalidateContainerDNS()
    // in case container_start event was processed check dockerContainer
    // otherwise dockerContainer wouldn't not exist
    var query = {
      _id: instance._id,
      'container.dockerContainer': containerId
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
    Instance.findOneAndUpdate(query, { $set: $set }, function (err, updatedInstance) {
      if (err) {
        log.error(put({
          err: err
        }, logData), 'updateOnContainerDie err')
        return cb(err)
      }
      if (!updatedInstance) { // changed or deleted
        log.error(logData,
          'updateOnContainerDie error instance not found')
        return cb(Boom.conflict("Container inspect data was not updated, instance's container has changed"))
      }
      log.trace(logData, 'updateOnContainerDie success')
      cb(null, updatedInstance)
    })
  }
