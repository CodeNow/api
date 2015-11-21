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
var Mavis = require('models/apis/mavis')
var map = require('object-loops/map')
var ContextVersion = require('models/mongo/context-version')
var Instance = require('models/mongo/instance')
var keypather = require('keypather')()
var log = require('middlewares/logger')(__filename).log
var rabbitMQ = require('models/rabbitmq')
var removeDottedKeys = require('remove-dotted-keys')
var toJSON = require('utils/to-json')
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
  var mavis = new Mavis()
  var instance = opts.instance
  var contextVersion = opts.contextVersion
  async.waterfall([
    findDockerHost,
    createDockerContainer
  ], finalCallback)
  function findDockerHost (cb) {
    log.info(logData, 'InstanceService._createDockerContainer findDockerHost')
    mavis.findDockForContainer(contextVersion, cb)
  }
  function createDockerContainer (dockerHost, cb) {
    log.info(put(logData, { dockerHost: dockerHost }),
      'InstanceService._createDockerContainer createDockerContainer')
    opts.dockerHost = dockerHost// used in handle4XXErr
    var docker = new Docker(dockerHost)
    docker.createUserContainer(opts, cb)
  }
  function finalCallback (err, container) {
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
      cb(err)
    } else {
      log.trace(logData, 'InstanceService._createDockerContainer finalCallback success')
      cb(null, container)
    }
  }
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
    Instance.findOneAndUpdate(query, { $set: $set }, function (err, instance) {
      if (err) {
        log.error(put({
          err: err
        }, logData), 'InstanceService.prototype.updateOnContainerStart err')
        return cb(err)
      }
      if (!instance) { // changed or deleted
        log.error(logData,
          'InstanceService.prototype.updateOnContainerStart error instance not found')
        return cb(Boom.conflict("Container IP was not updated, instance's container has changed"))
      }
      log.trace(logData, 'InstanceService.prototype.updateOnContainerStart success')
      cb(null, instance)
    })
  }
