'use strict'

var Boom = require('dat-middleware').Boom
var Promise = require('bluebird')
var assign = require('101/assign')
var exists = require('101/exists')
var find = require('101/find')
var keypather = require('keypather')()
var pick = require('101/pick')
var pluck = require('101/pluck')

var Instance = require('models/mongo/instance')
var InstanceForkService = require('models/services/instance-fork-service')
var Isolation = require('models/mongo/isolation')
var log = require('middlewares/logger')(__filename).log
var rabbitMQ = require('models/rabbitmq')

function IsolationService () {}

IsolationService.forkRepoChild = Promise.method(function (childInfo, masterInstanceShortHash, isolationId, sessionUser) {
  var logData = {
    tx: true,
    childInfo: childInfo,
    masterInstanceShortHash: masterInstanceShortHash,
    isolationId: isolationId,
    sessionUserUsername: keypather.get(sessionUser, 'accounts.github.username')
  }
  log.info(logData, 'IsolationService.forkRepoChild')
  if (!exists(childInfo)) {
    throw new Error('forkRepoChild childInfo is required')
  }
  ;[ 'repo', 'branch', 'org' ].forEach(function (k) {
    if (!exists(childInfo[k])) {
      throw new Error('forkRepoChild childInfo.' + k + ' is required')
    }
  })
  if (!exists(masterInstanceShortHash)) {
    throw new Error('forkRepoChild masterInstanceShortHash is required')
  }
  if (!exists(isolationId)) {
    throw new Error('forkRepoChild isolationId is required')
  }
  if (!exists(sessionUser)) {
    throw new Error('forkRepoChild sessionUser is required')
  }

  var fullRepo = [ childInfo.org, childInfo.repo ].join('/')
  return Instance.findForkableMasterInstancesAsync(fullRepo, childInfo.branch)
    .then(function (instances) {
      if (!Array.isArray(instances) || !instances.length) {
        log.error(logData, 'IsolationService.forkRepoChild did not recieve any instances')
        throw new Error('forkRepoChild could not find any instance to fork')
      }
      var instance = instances[0]
      var newInstanceOpts = {
        name: masterInstanceShortHash + '--' + instance.name,
        env: instance.env,
        isolated: isolationId.toString(),
        isIsolationGroupMaster: false
      }
      return InstanceForkService.forkRepoInstance(
        instance,
        newInstanceOpts,
        sessionUser
      )
    })
})

/**
 * Fork a non-repo child instance into an isolation group.
 * @param {ObjectId} instanceId Instance ID to fork.
 * @param {String} masterInstanceShortHash Short Hash of the master Instance.
 * @param {ObjectId} isolationId Isolation ID with which to mark the new
 *   Instance.
 * @param {Object} sessionUser Session User object for created by information.
 * @returns {Promise} Resolves with new, isolated Instance.
 */
IsolationService.forkNonRepoChild = function (instanceId, masterInstanceShortHash, isolationId, sessionUser) {
  var logData = {
    tx: true,
    instanceId: instanceId,
    masterInstanceShortHash: masterInstanceShortHash,
    isolationId: isolationId,
    sessionUserUsername: keypather.get(sessionUser, 'accounts.github.username')
  }
  log.info(logData, 'IsolationService.forkNonRepoChild')
  return Promise.try(function () {
    if (!exists(instanceId)) {
      throw new Error('forkNonRepoChild instanceId is required')
    }
    if (!exists(masterInstanceShortHash)) {
      throw new Error('forkNonRepoChild masterInstanceShortHash is required')
    }
    if (!exists(isolationId)) {
      throw new Error('forkNonRepoChild isolationId is required')
    }
    if (!exists(sessionUser)) {
      throw new Error('forkNonRepoChild sessionUser is required')
    }
  })
    .then(function () {
      return Instance.findByIdAsync(instanceId)
        .then(function (instance) {
          return InstanceForkService.forkNonRepoInstance(
            instance,
            masterInstanceShortHash,
            isolationId,
            sessionUser
          )
        })
    })
    .catch(function (err) {
      log.error(assign({ err: err }, logData), 'IsolationService.forkNonRepoChild error')
      throw err
    })
}

/**
 * Given a master Instance and some other instances, look for env variables in
 * the master that match hostnames of the given children. Replace the names with
 * the prefixed versions (with master.shortHash + '--') and update the model in
 * the database _if_ a change was made.
 * @param {Object} master Master Instance of which to update envs.
 * @param {Array<Object>} children Children Instances to look up hostnames.
 * @returns {Promise} Resolves with (updated) Instance.
 */
IsolationService._updateMasterEnv = Promise.method(function (master, children) {
  var logData = {
    tx: true
  }
  log.info(logData, 'IsolationService._updateMasterEnv')
  if (!exists(master)) {
    throw new Error('master is required')
  }
  if (!exists(children)) {
    throw new Error('children are required')
  }
  if (!Array.isArray(children)) {
    throw new Error('children must be an array')
  }
  logData.masterId = master._id.toString()
  logData.childrenId = children.map(pluck('_id'))

  var ownerUsername = master.owner.username.toLowerCase()
  var prefix = (master.shortHash + '--').toLowerCase()
  // searchNames e.g.: lowername-staging-org.runnableapp.com
  var searchNames = children.map(pluck('lowerName'))
    .map(function (lowerName) {
      var subDomain = [
        lowerName.replace(prefix, ''),
        'staging',
        ownerUsername
      ].join('-')
      return [
        subDomain,
        process.env.USER_CONTENT_DOMAIN
      ].join('.').toLowerCase()
    })

  // for every master env,
  var anyUpdate = false
  var envUpdate = master.env.map(function (env) {
    // look to see if it has one of our children
    var matchedName = find(searchNames, function (name) {
      return env.toLowerCase().indexOf(name) !== -1
    })

    // replace it, if it exists
    if (matchedName) {
      anyUpdate = true
      var foundIndex = env.toLowerCase().indexOf(matchedName)
      return [
        env.slice(0, foundIndex),
        prefix + matchedName,
        env.slice(foundIndex + matchedName.length)
      ].join('')
    } else {
      return env
    }
  })

  if (anyUpdate) {
    return Instance.findOneAndUpdateAsync(
      { _id: master._id },
      { $set: { env: envUpdate } }
    )
      .then(function (instance) {
        return instance.setDependenciesFromEnvironmentAsync(ownerUsername)
      })
  } else {
    return master
  }
})

/**
 * Create an Isolation and put Instances in the group. This currently creates an
 * Isolation and then modifies the master Instance to be the master of the
 * isolation group. This also will emit events for each modified Instance.
 * @param {Object} isolationConfig Data for creating Isolation.
 * @param {ObjectId} isolationConfig.master ID of the Instace which will be the master.
 * @param {Array<Object>} isolationConfig.children Currently not used.
 * @param {Object} sessionUser Session User for sending messages over primus.
 * @returns {Promise} Resolves with the new Isolation after all messages have
 *   been sent.
 */
IsolationService.createIsolationAndEmitInstanceUpdates = Promise.method(function (isolationConfig, sessionUser) {
  var logData = {
    tx: true,
    isolationConfig: isolationConfig,
    sessionUserUsername: keypather.get(sessionUser, 'accounts.github.username')
  }
  log.info(logData, 'IsolationService.createIsolationAndEmitInstanceUpdates')
  if (!exists(isolationConfig)) {
    throw Boom.badImplementation('isolationConfig is required')
  }
  if (!exists(sessionUser)) {
    throw Boom.badImplementation('sessionUser is required')
  }
  isolationConfig = pick(isolationConfig, [ 'master', 'children' ])
  return Isolation._validateCreateData(isolationConfig)
    .return(isolationConfig.master)
    .then(Isolation._validateMasterNotIsolated)
    .then(function (masterInstance) {
      return Isolation.createIsolation(isolationConfig)
        .then(function (newIsolation) {
          return {
            newIsolation: newIsolation,
            masterInstance: masterInstance
          }
        })
    })
    .then(function (models) {
      // isolate as master (pass true as second parameter)
      return models.masterInstance.isolate(models.newIsolation._id, true)
        .then(function (updatedMasterInstance) {
          models.masterInstance = updatedMasterInstance
          return models
        })
    })
    .then(function (models) {
      var nonRepoChildren = isolationConfig.children.filter(pick('instance'))
      var repoChildren = isolationConfig.children.filter(function (child) {
        return child.repo && child.org && child.branch
      })
      var masterInstanceShortHash = models.masterInstance.shortHash
      return Promise.props({
        nonRepo: Promise.map(
          nonRepoChildren,
          function (child) {
            return IsolationService.forkNonRepoChild(
              child.instance,
              masterInstanceShortHash,
              models.newIsolation._id,
              sessionUser
            )
          }
        ),
        repo: Promise.map(
          repoChildren,
          function (child) {
            return IsolationService.forkRepoChild(
              child,
              masterInstanceShortHash,
              models.newIsolation._id,
              sessionUser
            )
          }
        )
      })
        .then(function (newModels) {
          models.nonRepoChildren = newModels.nonRepo
          models.repoChildren = newModels.repo
          return models
        })
    })
    .then(function (models) {
      return IsolationService._updateMasterEnv(models.masterInstance, models.nonRepoChildren)
        .then(function (updatedMasterInstance) {
          models.masterInstance = updatedMasterInstance
          return models
        })
    })
    .then(function (models) {
      return Promise.all([
        IsolationService._emitUpdateForInstances([models.masterInstance], sessionUser),
        IsolationService._emitUpdateForInstances(models.nonRepoChildren, sessionUser),
        IsolationService._emitUpdateForInstances(models.repoChildren, sessionUser)
      ])
        .return(models)
    })
    .then(function (models) {
      rabbitMQ.redeployInstanceContainer({
        instanceId: models.masterInstance._id.toString(),
        sessionUserGithubId: sessionUser.accounts.github.id
      })
      return models.newIsolation
    })
    .catch(function (err) {
      log.error(assign({ err: err }, logData), 'IsolationService.createIsolationAndEmitInstanceUpdates error')
      throw err
    })
})

/**
 * Helper function to send updates for instances. Catches any errors from event
 * emitting.
 * @param {Array<Object>} instances Instance models to emit events.
 * @param {Object} sessionUser Session User for emitting updates.
 * @returns {Promise} Resolved when all events emitted.
 */
IsolationService._emitUpdateForInstances = function (instances, sessionUser) {
  var logData = {
    tx: true,
    sessionUserUsername: keypather.get(sessionUser, 'accounts.github.username')
  }
  log.info(logData, 'IsolationService._emitUpdateForInstances')
  return Promise.try(function () {
    if (!exists(instances)) {
      throw new Error('_emitUpdateForInstances instances are required')
    }
    assign(logData, { instanceIds: instances.map(pluck('_id')) })
    log.trace(logData, 'IsolationService._emitUpdateForInstances instanceIds')
    if (!exists(sessionUser)) {
      throw new Error('_emitUpdateForInstances sessionUser is required')
    }
  })
    .then(function () {
      return Promise.each(
        instances,
        function (instance) {
          return instance.emitInstanceUpdateAsync(sessionUser, 'isolation')
            .catch(function (err) {
              var logData = {
                instanceId: instance._id,
                err: err
              }
              log.warn(logData, 'isolation service failed to emit instance updates')
            })
        }
      )
    })
    .catch(function (err) {
      log.error(assign({ err: err }, logData), 'IsolationService._emitUpdateForInstances error')
      throw err
    })
}

/**
 * Helper function to remove the isolation-related prefix changes for instance
 * environment variables. Basically, it removes the shortHash-- prefix from the
 * addresses.
 * @param {Object} instance Instance in which to fix the environment variables.
 * @returns {Promise} Resolves with the updated Instance.
 */
IsolationService._removeIsolationFromEnv = Promise.method(function (instance) {
  if (!exists(instance)) {
    throw new Error('_removeIsolationFromEnv instance is required')
  }

  var lowerPrefix = instance.shortHash.toLowerCase() + '--'
  var anyUpdate = false
  var envUpdate = instance.env.map(function (env) {
    var findIndex = env.toLowerCase().indexOf(lowerPrefix)
    if (findIndex !== -1) {
      anyUpdate = true
      return [
        env.slice(0, findIndex),
        env.slice(findIndex + lowerPrefix.length)
      ].join('')
    } else {
      return env
    }
  })

  if (anyUpdate) {
    var ownerUsername = instance.owner.username
    return Instance.findOneAndUpdateAsync(
      { _id: instance._id },
      { $set: { env: envUpdate } }
    )
      .then(function (instance) {
        return instance.setDependenciesFromEnvironmentAsync(ownerUsername)
      })
  } else {
    return instance
  }
})

/**
 * Removes all Instances from Isolation and deletes the Isolation. This modifies
 * the master Instance and deletes all the children Instances and the Isolation
 * from the database.
 * @param {ObjectId} isolationId ID of the Isolation to remove.
 * @returns {Promise} Resolves with removed master Instance when complete.
 */
IsolationService.deleteIsolation = Promise.method(function (isolationId) {
  var logData = {
    tx: true,
    isolationId: isolationId
  }
  log.info(logData, 'IsolationService.deleteIsolation')
  if (!exists(isolationId)) {
    throw Boom.badImplementation('isolationId is required')
  }
  var findMasterOpts = {
    isolated: isolationId,
    isIsolationGroupMaster: true
  }
  var findChildrenOpts = {
    isolated: isolationId,
    isIsolationGroupMaster: false
  }
  return Promise.props({
    master: Instance.findOneAsync(findMasterOpts),
    children: Instance.findAsync(findChildrenOpts)
  })
    .then(function (instances) {
      var masterInstance = instances.master
      if (!masterInstance) {
        throw Boom.notFound('No Instance found for that Isolation Group')
      }
      return masterInstance.deIsolate()
        .then(function (updatedMasterInstance) {
          return IsolationService._removeIsolationFromEnv(updatedMasterInstance)
        })
        .then(function (updatedMasterInstance) {
          instances.master = updatedMasterInstance
          return instances
        })
    })
    .then(function (instances) {
      return Promise.each(
        instances.children,
        function (child) {
          return rabbitMQ.deleteInstance({
            instanceId: child._id
          })
        }
      )
        .return(instances.master)
    })
    .then(function (updatedMasterInstance) {
      var removeOpts = {
        _id: isolationId
      }
      return Isolation.findOneAndRemoveAsync(removeOpts)
        .return(updatedMasterInstance)
    })
    .then(function (updatedMasterInstance) {
      rabbitMQ.redeployInstanceContainer({
        instanceId: updatedMasterInstance._id.toString(),
        sessionUserGithubId: updatedMasterInstance.createdBy.github
      })
      return updatedMasterInstance
    })
    .catch(function (err) {
      log.error(assign({ err: err }, logData), 'IsolationService.deleteIsolation error')
      throw err
    })
})

/**
 * Removes all Instances from Isolation and deletes the Isolation. This modifies
 * the master Instance and deletes all the children Instances and the Isolation
 * from the database. It also emits events for the deleted Instance.
 * @param {ObjectId} isolationId ID of the Isolation to remove.
 * @param {Object} sessionUser Session User for sending messages over primus.
 * @returns {Promise} Resolves when all actions complete.
 */
IsolationService.deleteIsolationAndEmitInstanceUpdates = Promise.method(function (isolationId, sessionUser) {
  var logData = {
    tx: true,
    isolationId: isolationId,
    sessionUserUsername: keypather.get(sessionUser, 'accounts.github.username')
  }
  log.info(logData, 'IsolationService.deleteIsolationAndEmitInstanceUpdates')
  if (!exists(isolationId)) {
    throw Boom.badImplementation('isolationId is required')
  }
  if (!exists(sessionUser)) {
    throw Boom.badImplementation('sessionUser is required')
  }
  return IsolationService.deleteIsolation(isolationId)
    .then(function (deletedMasterInstance) {
      return IsolationService._emitUpdateForInstances([deletedMasterInstance], sessionUser)
    })
    .catch(function (err) {
      log.error(assign({ err: err }, logData), 'IsolationService.deleteIsolationAndEmitInstanceUpdates error')
      throw err
    })
})

module.exports = IsolationService
