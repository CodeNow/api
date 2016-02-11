/**
 * Instance service performs more complex actions related to the instances.
 * The service interacts not only with DB models but with other systems like
 * job queue.
 * @module lib/models/services/instance-service
 */

'use strict'

var Boom = require('dat-middleware').Boom
var Promise = require('bluebird')
var assign = require('101/assign')
var async = require('async')
var keypather = require('keypather')()
var map = require('object-loops/map')
var put = require('101/put')

var ContextVersion = require('models/mongo/context-version')
var Docker = require('models/apis/docker')
var Instance = require('models/mongo/instance')
var User = require('models/mongo/user')
var equalObjectIds = require('utils/equal-object-ids')
var error = require('error')
var formatObjectForMongo = require('utils/format-object-for-mongo')
var joi = require('utils/joi')
var log = require('middlewares/logger')(__filename).log
var messenger = require('socket/messenger')
var rabbitMQ = require('models/rabbitmq')
var toJSON = require('utils/to-json')

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
InstanceService.deleteForkedInstancesByRepoAndBranch = function (instanceId, repo, branch, cb) {
  var logData = {
    tx: true,
    instanceId: instanceId,
    repo: repo,
    branch: branch
  }
  log.info(logData, 'InstanceService.deleteForkedInstancesByRepoAndBranch')
  // do nothing if parameters are missing
  if (!instanceId || !repo || !branch) {
    log.warn(logData, 'deleteForkedInstancesByRepoAndBranch quit')
    return cb()
  }
  Instance.findForkedInstances(repo, branch, function (err, instances) {
    if (err) {
      log.error(put({ err: err }, logData), 'deleteForkedInstancesByRepoAndBranch')
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
      InstanceService._createDockerContainer(createOpts, function (err, result) {
        if (err) {
          log.error(put({ err: err }, logData), 'createContainer failed')
          return cb(err)
        }
        cb(null, result)
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
  var instanceQuery = {
    '_id': instanceId,
    'container': {
      $exists: false
    },
    'contextVersion.id': contextVersionId
  }
  async.parallel({
    instance: Instance.findOne.bind(Instance, instanceQuery),
    contextVersion: ContextVersion.findById.bind(ContextVersion, contextVersionId)
  }, function (err, data) {
    if (err) {
      log.error(put(logData, { err: err }), 'InstanceService._findInstanceAndContextVersion dbErr')
      return cb(err)
    }
    err = validateMongoData(data)
    if (err) {
      log.error(put(logData, { err: err }), '_findInstanceAndContextVersion validationErr')
      return cb(err)
    }
    log.trace(put(logData, { data: data }), '_findInstanceAndContextVersion success')

    if (!data.instance.parent) {
      return cb(null, data)
    }
    log.trace(put(logData, { data: data }),
      '_findInstanceAndContextVersion check if parent exists')
    Instance.findOneByShortHash(data.instance.parent, function (err, parent) {
      if (err) {
        log.error(put(logData, { data: data, err: err }),
          '_findInstanceAndContextVersion parent lookup error')
        return cb(err)
      }
      if (!parent) {
        err = Boom.notFound('Parent instance not found', opts)
        log.error(put(logData, { data: data, err: err }),
          '_findInstanceAndContextVersion parent lookup error: not found')
        return cb(err)
      }
      log.trace(put(logData, { data: data }),
        '_findInstanceAndContextVersion parent lookup success')
      cb(null, data)
    })
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
  log.info(logData, 'InstanceService._createDockerContainer')
  var instance = opts.instance
  var contextVersion = opts.contextVersion

  var docker = new Docker()
  docker.createUserContainer(opts, function (err, container) {
    if (error.is4XX(err)) {
      // 4XX errs are not retryable, so mark db state
      log.error(put(logData, { err: err }), '_createDockerContainer finalCallback error')
      instance.modifyContainerCreateErr(contextVersion._id, err, function (err2) {
        if (err2) {
          log.error(put(logData, { err: err2 }), '_createDockerContainer finalCallback db error')
        }
        // if db write is successful, callback 4XX error
        // if db write was unsuccessful (err2), then callback err2 (500 error)
        cb(err2 || err)
      })
    } else if (err) { // 5XX err (non 4XX err)
      log.trace(put(logData, { err: err }), '_createDockerContainer finalCallback 5XX error')
      cb(err)
    } else {
      log.trace(logData, '_createDockerContainer finalCallback success')
      cb(null, container)
    }
  })
}

/**
 * Modifies instance container with docker inspect data
 * Clears any potentially hazard in the set object that could cause mongo errors
 * @param  {Object}   query     - query to find matching instances to update
 * @param  {Object}   setObject - object set as the $set value of the mongo update
 * @param  {Function} cb        - standard Node.js callback
 */
InstanceService.updateContainerInspect = function (query, setObject, cb) {
  var logData = {
    tx: true,
    query: query,
    setObject: setObject
  }
  log.info(logData, 'InstanceService.updateContainerInspect')
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
      }, logData), 'updateContainerInspect error')
      return cb(err)
    }
    if (!instance) { // changed or deleted
      log.error(put({ query: setObject }, logData),
        'updateContainerInspect error instance not found')
      return cb(Boom.conflict("Container was not updated, instance's container has changed"))
    }
    log.trace(put({ query: setObject },
      logData), 'updateContainerInspect success')
    cb(null, instance)
  })
}

/**
 * Modifies instance container with docker inspect data and, optionally, adds weave/network IP.
 * Invalidates charon cache after(!) we update mongo
 * Flow:
 *  1. fetch instance using instance id and container id
 *  2. update instance using instance id and container id with latest inspect data
 *  3. invalidate charon cache based on data from the model fetched on the step 1
 * @param  {String}   instanceId       - instanceId of instance that should be updated
 * @param  {String}   containerId      - docker container id
 * @param  {Object}   containerInspect - docker inspect data
 * @param  {String}   containerIp      - (optional) docker container ip address
 * @param  {Function} cb               - standard Node.js callback
 */
InstanceService.modifyExistingContainerInspect =
  function (instanceId, containerId, containerInspect, containerIp, cb) {
    var logData = {
      tx: true,
      instanceId: instanceId,
      containerId: containerId,
      containerInspect: containerInspect
    }
    if (typeof containerIp === 'function') {
      cb = containerIp
      containerIp = null
    } else {
      logData.containerIp = containerIp
    }
    // in case container_start event was processed check dockerContainer
    // otherwise dockerContainer would not exist
    var query = {
      _id: instanceId,
      'container.dockerContainer': containerId
    }
    log.info(logData, 'InstanceService.modifyContainerInspect')
    Instance.findOne(query, function (err, oldInstance) {
      if (err) {
        log.error(put({ err: err }, logData), 'modifyContainerInspect lookup instance failed')
        return cb(err)
      }
      if (!oldInstance) { // changed or deleted
        log.error(put({ query: query }, logData),
          'modifyContainerInspect error instance not found')
        return cb(Boom.conflict("Container was not updated, instance's container has changed"))
      }
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
      InstanceService.updateContainerInspect(query, $set, function (err, instance) {
        if (err) {
          return cb(err)
        }
        // NOTE: instance should always exist at this point
        // Any time the inspect data is to be updated we need to ensure the old
        // DNS entries for this container have been invalidated on the charon cache.
        // we should call invalidate on the old model  and not updated instance
        oldInstance.invalidateContainerDNS()
        cb(null, instance)
      })
    })
  }

/**
 * Try to stop instance.
 * 1) Check if instance is starting or stopping.
 * 2) Create stop instance task
 * 3) Set Instance into stopping state
 * @param {Instance} instanceData - Instance model data we are updating
 * @param {Number} sessionUserGithubId - github id of the session user
 * @returns {Promise}
 */
InstanceService.stopInstance = function (instanceData, sessionUserGithubId) {
  var logData = {
    tx: true,
    instance: instanceData,
    sessionUserGithubId: sessionUserGithubId
  }
  var instance = new Instance(instanceData)
  log.info(logData, 'InstanceService.stopInstance')
  return Promise.resolve()
    .then(function () {
      var containerId = keypather.get(instance, 'container.dockerContainer')
      if (!containerId) {
        throw Boom.badRequest('Instance does not have a container')
      }
    })
    .then(function () {
      log.trace(logData, 'stopInstance check state')
      return instance.isNotStartingOrStoppingAsync()
    })
    .then(function () {
      log.trace(logData, 'stopInstance marking as stopping')
      return Instance.markAsStoppingAsync(instance._id, instance.container.dockerContainer)
        .then(function (instance) {
          log.trace(put({
            containerState: keypather.get(instance, 'container.inspectData.State')
          }, logData), 'stopInstance publish stop job')
          rabbitMQ.stopInstanceContainer({
            containerId: instance.container.dockerContainer,
            instanceId: instance._id.toString(),
            sessionUserGithubId: sessionUserGithubId,
            tid: keypather.get(process.domain, 'runnableData.tid.toString()')
          })
          return
        })
    })
}

/**
 * Try to start instance.
 * 1) Check if instance is starting or stopping.
 * 2) Create start instance task or redeploy if instance was migrated
 * 3) Set Instance into starting state
 * @param {Instance} instanceData - Instance model data we are updating
 * @param {Number} sessionUserGithubId - github id of the session user
 * @returns {Promise}
 */
InstanceService.startInstance = function (instanceData, sessionUserGithubId) {
  var logData = {
    tx: true,
    instance: instanceData,
    sessionUserGithubId: sessionUserGithubId
  }
  var instance = new Instance(instanceData)
  log.info(logData, 'InstanceService.startInstance')
  return Promise.resolve()
    .then(function () {
      var containerId = keypather.get(instance, 'container.dockerContainer')
      if (!containerId) {
        throw Boom.badRequest('Instance does not have a container')
      }
    })
    .then(function () {
      log.trace(logData, 'startInstance check state')
      return instance.isNotStartingOrStoppingAsync()
    })
    .then(function () {
      var dockRemoved = keypather.get(instance, 'contextVersion.dockRemoved')
      if (dockRemoved) {
        log.trace(logData, 'startInstance dockRemoved: need to redeploy')
        rabbitMQ.redeployInstanceContainer({
          instanceId: instance._id,
          sessionUserGithubId: sessionUserGithubId
        })
        return
      }

      log.trace(logData, 'startInstance marking as starting')
      return instance.setContainerStateToStartingAsync()
        .then(function () {
          log.trace(put({
            containerState: keypather.get(instance, 'container.inspectData.State')
          }, logData), 'startInstance publish stop job')
          rabbitMQ.startInstanceContainer({
            dockerContainer: instance.container.dockerContainer,
            dockerHost: instance.container.dockerHost,
            instanceId: instance._id.toString(),
            ownerUsername: instance.owner.username,
            sessionUserGithubId: sessionUserGithubId,
            tid: keypather.get(process.domain, 'runnableData.tid.toString()')
          })
          return
        })
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
