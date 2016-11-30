'use strict'
var Boom = require('dat-middleware').Boom
var exists = require('101/exists')
var isEmpty = require('101/is-empty')
var keypather = require('keypather')()
var pick = require('101/pick')
var pluck = require('101/pluck')
var Promise = require('bluebird')

var AutoIsolationConfig = require('models/mongo/auto-isolation-config')
var ContextVersion = require('models/mongo/context-version')
var Github = require('models/apis/github')
var Instance = require('models/mongo/instance')
var InstanceForkService = require('models/services/instance-fork-service')
var Isolation = require('models/mongo/isolation')
var joi = require('utils/joi')
var logger = require('logger')
var PermissionService = require('models/services/permission-service')
var rabbitMQ = require('models/rabbitmq')
var User = require('models/mongo/user')
var utils = require('middlewares/utils')

function IsolationService () {}

IsolationService.logger = logger.child({
  module: 'IsolationService'
})

/**
 * Find a isolation and throw an error if isolation was not found or access denied
 * @param {String} isolationId internal isolation id
 * @param {Object} sessionUser mongo model representing session user
 * @resolves with found Isolation model
 * @throws   {Boom.badRequest}   When isolation id is invalid
 * @throws   {Boom.notFound}     When isolation lookup failed
 * @throws   {Boom.accessDenied} When perm check failed
 * @throws   {Error}             When Mongo fails
 */
IsolationService.findIsolation = function (isolationId, sessionUser) {
  var log = IsolationService.logger.child({
    method: 'findIsolation',
    isolationId: isolationId,
    sessionUser: sessionUser
  })
  log.info('findIsolation: call')
  return Promise.try(function () {
    if (!utils.isObjectId(isolationId)) {
      log.error('findIsolation: Isolation id is not valid')
      throw Boom.badRequest('Invalid isolation id', { isolationId: isolationId })
    }
  })
  .then(function () {
    Isolation.findByIdAsync(isolationId)
    .tap(function checkIsolation (isolation) {
      if (!isolation) {
        log.error('findIsolation: Isolation was not found')
        throw Boom.notFound('Isolation not found', { isolationId: isolationId })
      }
    })
    .tap(function (isolation) {
      return PermissionService.isOwnerOf(sessionUser, isolation)
    })
  })
}

/**
 * Fork a repo child instance into an isolation group. This does not take any
 * commit information: it will fetch from Github the latest commit for the
 * provded branch.
 * @param {object} childInfo Information about the child.
 * @param {string} childInfo.repo Repository of which to fork.
 * @param {string} childInfo.branch Branch of the repository to fork.
 * @param {string} childInfo.org Organization that owns the repository
 *   (e.g. "Runnable").
 * @param {string} masterInstanceShortHash Short Hash of the master Instance.
 * @param {ObjectId} isolationId Isolation ID with which to mark the new
 *   Instance.
 * @param {object} sessionUser Session User object for created by information.
 * @returns {Promise} Resolves with new, isolated Instance.
 */
IsolationService.forkRepoChild = Promise.method(function (childInfo, masterInstanceShortHash, isolationId, sessionUser) {
  var log = this.logger.child({
    method: 'InstanceService.forkRepoChild',
    childInfo: childInfo,
    masterInstanceShortHash: masterInstanceShortHash,
    isolationId: isolationId,
    sessionUserUsername: keypather.get(sessionUser, 'accounts.github.username')
  })
  log.info('IsolationService.forkRepoChild - call')

  var childInfoSchema = joi.object().keys({
    branch: joi.string().required(),
    repo: joi.string(),
    org: joi.string(),
    matchBranch: joi.boolean(),
    instance: joi.string()
  })
    .xor('repo', 'instance')
    .xor('org', 'instance')
    .and('repo', 'org')

  if (!exists(childInfo)) {
    throw new Error('forkRepoChild childInfo is required')
  }
  if (!exists(masterInstanceShortHash)) {
    throw new Error('forkRepoChild masterInstanceShortHash is required')
  }
  if (!exists(isolationId)) {
    throw new Error('forkRepoChild isolationId is required')
  }
  if (!exists(sessionUser)) {
    throw new Error('forkRepoChild sessionUser is required')
  }

  return joi.validateOrBoomAsync(childInfo, childInfoSchema)
    .then(function (childInfo) {
      // Repo container specified by org/repoName
      if (childInfo.repo && childInfo.org) {
        var fullRepo = childInfo.org + '/' + childInfo.repo
        return Instance.findMasterInstancesForRepoAsync(fullRepo)
          .then(function (instances) {
            if (!Array.isArray(instances) || !instances.length) {
              log.error('did not find any master instances to fork')
              throw Boom.badRequest('forkRepoChild could not find any instance to fork')
            }
            if (instances.length > 1) {
              log.error({
                fullRepo: fullRepo,
                numberOfInstances: instances.length
              }, 'Multiple instances with this org/repo/branch')
              throw Boom.badRequest('forkRepoChild could not determine which instance to fork (multiple matching instances)')
            }
            return instances[0]
          })
      }
      // Repo container specified by instance ID
      return Instance.findByIdAsync(childInfo.instance)
        .tap(function (instance) {
          if (!instance) {
            log.error({
              instanceId: childInfo.instance
            }, 'No instance found with the corresponding ID')
            throw new Error('forkRepoChild could not find specified instance')
          }
        })
    })
    .then(function (instance) {
      var repoName = instance.contextVersion.appCodeVersions[0].repo
      var accessToken = keypather.get(sessionUser, 'accounts.github.accessToken')
      var github = new Github({ token: accessToken })
      log.trace({
        instance: instance,
        repoName: repoName
      }, 'find instance to isolate by id')
      return Promise.fromCallback(function (callback) {
        github.getBranch(repoName, childInfo.branch, callback)
      })
        .then(function (branchInfo) {
          return {
            repoName: repoName,
            instance: instance,
            commit: keypather.get(branchInfo, 'commit.sha')
          }
        })
    })
    .then(function (data) {
      var instance = data.instance
      var commit = data.commit
      var repoName = data.repoName
      var newInstanceOpts = {
        name: masterInstanceShortHash + '--' + instance.name,
        env: instance.env,
        isolated: isolationId.toString(),
        isIsolationGroupMaster: false,
        repo: repoName,
        branch: childInfo.branch,
        commit: commit,
        user: { id: keypather.get(sessionUser, 'accounts.github.id') }
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
  var log = this.logger.child({
    method: 'forkNonRepoChild',
    instanceId: instanceId,
    masterInstanceShortHash: masterInstanceShortHash,
    isolationId: isolationId,
    sessionUserUsername: keypather.get(sessionUser, 'accounts.github.username')
  })
  log.info('forking non-repository child for isolation')
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
      log.error({ err: err }, 'errored while forking non-repository child')
      throw err
    })
}

var ISOLATION_PREFIX_REGEX = /^[A-z0-9]*--/

/**
 * Given an array of potential dependents, this will filter out the actual dependents, then update
 * the Dependency graph for each one.
 * @param    {Instance}    instance - Main instance that depends on the children
 * @param    {[Instances]} children - Array of potential dependents of the instance with which to
 *                           update.  These should be the newly isolated forked children
 * @returns  {Promise}     Resolves when all of the graph updates have been completed
 * @resolves {[Instances]} Array of filtered children that have just been used to update
 *                           the instance's graph
 *
 * @throws   {Boom.badRequest} When a child is missing it's elasticHostname
 * @throws   {Error}           Mongo Errors
 */
IsolationService._updateDependenciesForInstanceWithChildren = function (instance, children) {
  var log = IsolationService.logger.child({
    method: '_updateDependenciesForInstanceWithChildren',
    instance: instance,
    children: children.map(pluck('lowerName'))
  })
  log.info('_updateDependenciesForInstanceWithChildren called')

  return Promise.try(function () {
    if (!exists(instance)) {
      throw new Error('instance is required')
    }
    if (!exists(children)) {
      throw new Error('children are required')
    }
    if (!Array.isArray(children)) {
      throw new Error('children must be an array')
    }
  })
    .then(function () {
      log.trace('getting instance dependencies')
      return instance.getDependenciesAsync()
    })
    .then(function pluckOutNames (nodeArray) {
      log.trace('cleaning up node map')
      var nodeMap = {}
      nodeArray.forEach(function (node) {
        nodeMap[node.elasticHostname] = node
      })
      log.trace({ nodeMap: nodeMap }, 'cleaned up node map')
      return nodeMap
    })
    .then(function (nodeMap) {
      log.trace('get ready to update all the dependencies')
      function returnChildIfInNodeMap (child) {
        if (!keypather.get(child, 'elasticHostname')) {
          throw Boom.badRequest('child is missing an elasticHostname', {
            child: child._id
          })
        }
        var returnValue = nodeMap[child.elasticHostname]
        log.trace({
          instance: child,
          elasticHostname: child.elasticHostname,
          returnValue: returnValue
        }, 'filter information conclusion')
        return returnValue
      }
      var childrenInNodeMap = children.filter(returnChildIfInNodeMap)
      var nodesThatAreInChildren = childrenInNodeMap.map(returnChildIfInNodeMap)
      log.trace({
        childrenInNodeMap: childrenInNodeMap.map(pluck('name')),
        nodesThatAreInChildren: nodesThatAreInChildren.map(pluck('name'))
      }, 'some filtering')
      return Promise.all([
        Promise.each(childrenInNodeMap, function addEachChildForMaster (childInstance) {
          var elasticHostname = childInstance.elasticHostname.replace(ISOLATION_PREFIX_REGEX, '')
          log.trace({ target: instance.name, child: childInstance.name, elasticHostname: elasticHostname }, 'adding a dependency')
          return instance.addDependency(childInstance)
        }),
        Promise.each(nodesThatAreInChildren, function removeEachChildForMaster (childInstance) {
          return instance.removeDependency(childInstance._id)
        })
      ])
    })
}

/**
 * Given an array of potential dependents, this will filter out the actual dependents, then update
 * the Dependency graph for each one
 * @param    {Instance}    master   - Master Instance of the isolation group
 * @param    {[Instances]} children - Isolated children which need to update their dependencies
 * @returns  {Promise}     Resolves when all of the graph updates have been completed
 * @resolves {[Instances]} Original array of children instances
 * @throws   {Error}
 */
IsolationService.updateDependenciesForIsolation = function (master, children) {
  var log = this.logger.child({ method: 'updateDependenciesForIsolation' })

  return Promise.try(function () {
    if (!exists(master)) {
      throw new Error('master is required')
    }
    if (!exists(children)) {
      throw new Error('children are required')
    }
    if (!Array.isArray(children)) {
      throw new Error('children must be an array')
    }
  })
    .then(function () {
      var childrenAndMaster = [master].concat(children)
      log.trace({
        masterId: master._id.toString(),
        childrenId: children.map(pluck('_id')),
        instanceIds: childrenAndMaster.map(pluck('_id'))
      }, 'updating master and children')
      return Promise.each(childrenAndMaster, function (instance) {
        // Do it for every included child, even ones that were filtered out. Some of these
        // children have dependents that weren't dependant on the master
        return IsolationService._updateDependenciesForInstanceWithChildren(instance, childrenAndMaster)
          .catch(function (err) {
            log.error({
              err: err,
              instance: instance
            }, 'Error updating dependencies')
            throw err
          })
      })
    })
    .return(children)
}

/**
 * Create an Isolation and put Instances in the group. This currently creates an
 * Isolation and then modifies the master Instance to be the master of the
 * isolation group. This also will emit events for each modified Instance.
 * @param {Object} isolationConfig Data for creating Isolation.
 * @param {ObjectId} isolationConfig.master ID of the Instace which will be the master.
 * @param {Array<Object>} isolationConfig.children Children instances to isolate
 *   using repo, org, and branch OR an instance id.
 * @param {Object} sessionUser Session User for sending messages over primus.
 * @returns {Promise} Resolves with the new Isolation after all messages have
 *   been sent.
 */
IsolationService.createIsolationAndEmitInstanceUpdates = Promise.method(function (isolationConfig, sessionUser) {
  var log = this.logger.child({
    isolationConfig: isolationConfig,
    sessionUserUsername: keypather.get(sessionUser, 'accounts.github.username')
  })

  log.info('creating an isolation and emitting instance updates')
  if (!exists(isolationConfig)) {
    throw Boom.badImplementation('isolationConfig is required')
  }
  if (!exists(sessionUser)) {
    throw Boom.badImplementation('sessionUser is required')
  }
  isolationConfig = pick(isolationConfig, [ 'master', 'children', 'redeployOnKilled' ])
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
      var nonRepoChildren = isolationConfig.children.filter(function (child) {
        var hasInstance = !!child.instance
        var hasBranchOrMatchBranch = child.branch || child.matchBranch
        return hasInstance && !hasBranchOrMatchBranch
      })
      var repoChildren = isolationConfig.children.filter(function (child) {
        var hasRepoAndOrg = child.repo && child.org
        var hasInstance = !!child.instance
        var hasBranchOrMatchBranch = child.branch || child.matchBranch
        return (hasRepoAndOrg || hasInstance) && hasBranchOrMatchBranch
      })
      // Branch matching
      var masterInstanceAppCodeVerions = keypather.get(models, 'masterInstance.contextVersion.appCodeVersions')
      var masterInstanceMainACV = ContextVersion.getMainAppCodeVersion(masterInstanceAppCodeVerions)
      var masterInstanceBranch = masterInstanceMainACV.branch
      repoChildren = repoChildren.map(function (child) {
        if (child.matchBranch) {
          child.branch = masterInstanceBranch
        }
        return child
      })
      log.trace({
        repoChildren: repoChildren,
        nonRepoChildren: nonRepoChildren
      }, 'Enqueue creation of new instances')

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
      var allChildren = models.repoChildren.concat(models.nonRepoChildren)
      return IsolationService.updateDependenciesForIsolation(models.masterInstance, allChildren)
        .return(models)
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
      log.error({ err: err }, 'something errored while isolating and emitting')
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
  var log = this.logger.child({
    method: '_emitUpdateForInstances',
    sessionUserUsername: keypather.get(sessionUser, 'accounts.github.username')
  })
  log.info('emitting instance updates')
  return Promise.try(function () {
    if (!exists(instances)) {
      throw new Error('_emitUpdateForInstances instances are required')
    }
    log.trace({
      instanceIds: instances.map(pluck('_id'))
    }, 'emitting instance updates for these instances')
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
      log.error({ err: err }, 'errored while emitting updates')
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
  var log = this.logger.child({
    method: '_removeIsolationFromEnv',
    instance: instance
  })
  log.info('removing isolation information from instance environment')
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
 * Find all children (non-master) instances for the isolation and publish job to delete each of them
 * @param {ObjectId} isolationId - ID of the Isolation to find children instance
 * @returns {Promise} Resolves with array of children instances
 */
IsolationService.deleteIsolatedChildren = function (isolationId) {
  const log = this.logger.child({
    method: 'deleteIsolatedChildren',
    isolationId
  })
  log.info('called')

  return Promise.try(function () {
    if (!exists(isolationId)) {
      throw Boom.badImplementation('isolationId is required')
    }
  })
  .then(function () {
    const findChildrenOpts = {
      isolated: isolationId,
      isIsolationGroupMaster: false
    }
    return Instance.findAsync(findChildrenOpts)
  })
  .each(function (instance) {
    const instanceId = keypather.get(instance, '._id.toString()')
    rabbitMQ.deleteInstance({ instanceId })
  })
}

/**
 * Removes all Instances from Isolation and deletes the Isolation. This modifies
 * the master Instance and deletes all the children Instances and the Isolation
 * from the database.
 * @param {ObjectId} isolationId ID of the Isolation to remove.
 * @returns {Promise} Resolves with removed master Instance when complete.
 */
IsolationService.deleteIsolation = Promise.method(function (isolationId) {
  var log = this.logger.child({
    method: 'deleteIsolation',
    isolationId: isolationId
  })
  log.info('deleting isolation')
  if (!exists(isolationId)) {
    throw Boom.badImplementation('isolationId is required')
  }
  var findMasterOpts = {
    isolated: isolationId,
    isIsolationGroupMaster: true
  }
  return Instance.findOneAsync(findMasterOpts)
    .tap(function (masterInstance) {
      if (!masterInstance) {
        throw Boom.notFound('No Instance found for that Isolation Group')
      }
      return masterInstance.deIsolate()
    })
    .tap(function () {
      return IsolationService.deleteIsolatedChildren(isolationId)
    })
    .then(function (updatedMasterInstance) {
      var removeOpts = {
        _id: isolationId
      }
      return Isolation.findOneAndRemoveAsync(removeOpts)
        .then(function () {
          return updatedMasterInstance.setDependenciesFromEnvironmentAsync(updatedMasterInstance.owner.username)
        })
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
      log.error({ err: err }, 'errored while deleting isolation')
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
  var log = this.logger.child({
    method: 'deleteIsolationAndEmitInstanceUpdates',
    isolationId: isolationId,
    sessionUserUsername: keypather.get(sessionUser, 'accounts.github.username')
  })
  log.info('deleting isolation and emitting updates')
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
      log.error({ err: err }, 'errored while deleting isolation and emitting updates')
      throw err
    })
})

IsolationService.autoIsolate = Promise.method(function (newInstances, pushInfo) {
  var log = this.logger.child({
    method: 'autoIsolate',
    instances: newInstances.map(pluck('_id')),
    pushInfo: pushInfo
  })
  log.info('attempting to autoisolate instances')
  return Promise.each(
    newInstances,
    function isolateEachNewInstance (i) {
      log.debug({ instanceId: i._id }, 'looking for aics')
      return Instance.findOneAsync({ shortHash: i.parent })
        .then(function (fullParentInstance) {
          log.debug({ instanceId: fullParentInstance && fullParentInstance._id }, 'aic found instance')
          if (!fullParentInstance) { return null }
          return AutoIsolationConfig.findOneAsync({
            instance: fullParentInstance._id
          })
        })
        .then(function (aic) {
          log.debug({ aic: aic }, 'back from looking for aics')
          if (!aic) { return }
          log.trace('autoisolating')
          var instanceUserGithubId = keypather.get(i, 'createdBy.github')
          var pushUserGithubId = keypather.get(pushInfo, 'user.id')
          return Promise.props({
            // instanceUser is the owner of the instance.
            instanceUser: User.findByGithubIdAsync(instanceUserGithubId),
            // pushUser is the user who pushed to GitHub (if we have the user in
            // our database).
            pushUser: User.findByGithubIdAsync(pushUserGithubId)
          })
            .then(function (result) {
              var isolationConfig = {
                master: i._id.toString(),
                children: aic.requestedDependencies.map(function (d) {
                  // basically, the next function doesn't like mongo models
                  if (d.instance) {
                    var o = { instance: d.instance.toString() }
                    if (d.matchBranch) { o.matchBranch = d.matchBranch }
                    return o
                  }
                  return pick(d, ['org', 'repo', 'branch'])
                }),
                redeployOnKilled: aic.redeployOnKilled || false
              }
              var sessionUser = result.pushUser || result.instanceUser
              return IsolationService.createIsolationAndEmitInstanceUpdates(
                isolationConfig,
                sessionUser
              )
            })
        })
    }
  )
})

/**
 * If the master of the isolation is testing instance the whole isolation was created
 * for testing
 * @param {ObjectId} isolationId - ID of the isolation
 * @return {Promise}
 * @resolve {Boolean} - True if isolation is made for testing: master has `isTesting` set to true.
 */
IsolationService.isTestingIsolation = function (isolationId) {
  return Instance.findOneAsync({
    isolated: isolationId,
    isIsolationGroupMaster: true,
    isTesting: true
  }).then(function (instance) {
    return !!instance
  })
}

/**
 * If the isolation is redeployOnKilled and state is killing we
 * should mark isolation as killed and trigger redeploy
 * @param {ObjectId} isolationId - ID of the isolation
 * @return {Promise}
 * @resolve {Boolean} - True if redeploy triggered
 */
IsolationService.redeployIfAllKilled = function (isolationId) {
  var log = this.logger.child({
    method: 'redeployIfAllKilled',
    isolationId: isolationId
  })
  log.info('called')
  return Isolation.findOneAsync({
    _id: isolationId,
    redeployOnKilled: true,
    state: 'killing'
  })
    .then(function (isolation) {
      log.trace({isolation: isolation}, 'isolation find results')
      if (!isolation) {
        return false
      }
      return Instance.findAsync({
        isolated: isolationId,
        $or: [
          { 'container.inspect.State.Stopping': true },
          { 'container.inspect.State.Running': true }
        ]
      })
    })
    .then(function (instances) {
      log.trace({
        instances: keypather.get(instances, 'length')
      }, 'isolated instances find results')
      if (!instances || !isEmpty(instances)) {
        return false
      }
      log.trace('set isolation state to killed from killing')
      return Isolation.findOneAndUpdateAsync({
        _id: isolationId,
        redeployOnKilled: true,
        state: 'killing'
      }, {
        $set: {
          state: 'killed'
        }
      })
        .then(function () {
          rabbitMQ.redeployIsolation({
            isolationId: isolationId.toString()
          })
        })
        .return(true)
    })
}

module.exports = IsolationService
