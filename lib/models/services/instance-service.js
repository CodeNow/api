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
var pick = require('101/pick')
var uuid = require('uuid')

var BuildService = require('models/services/build-service')
var ContextVersion = require('models/mongo/context-version')
var Docker = require('models/apis/docker')
var Build = require('models/mongo/build')
var Instance = require('models/mongo/instance')
var User = require('models/mongo/user')
var error = require('error')
var formatObjectForMongo = require('utils/format-object-for-mongo')
var InstanceCounter = require('models/mongo/instance-counter')
var joi = require('utils/joi')
var logger = require('middlewares/logger')(__filename)
var log = logger.log
var messenger = require('socket/messenger')
var objectId = require('objectid')
var rabbitMQ = require('models/rabbitmq')

var ENV_REGEX = /^([A-z]+[A-z0-9_]*)=.*$/

function InstanceService () {}

module.exports = InstanceService

var createInstanceBodySchema = {
  autoForked: joi.boolean(),
  build: joi.string().required(),
  env: joi.array().items(joi.string().regex(ENV_REGEX, 'envs')),
  ipWhitelist: joi.object({
    enabled: joi.boolean()
  }),
  isIsolationGroupMaster: joi.boolean(),
  isolated: joi.string(),
  masterPod: joi.boolean(),
  name: joi.string().regex(/^[-0-9a-zA-Z]+$/).required(),
  owner: joi.object({
    github: joi.alternatives().try(joi.number(), joi.string())
  }).unknown(),
  parent: joi.string(),
  public: joi.boolean(),
  hostname: joi.string(),
  locked: joi.boolean()
}
var updateInstanceBodySchema = {
  build: joi.string(),
  env: joi.array().items(joi.string().regex(ENV_REGEX, 'envs')),
  ipWhitelist: joi.object({
    enabled: joi.boolean()
  }),
  isIsolationGroupMaster: joi.boolean(),
  isolated: joi.string(),
  public: joi.boolean(),
  locked: joi.boolean()
}

InstanceService.validateOpts = function (schema, opts) {
  var schemaObject = joi.object(schema)
    .unknown()
    .required()
    .label('Instance opts validate')

  if (opts.env) {
    // Remove any empty space envs before validating
    opts.env = opts.env.filter(function (env) {
      return !(/^\s*$/.test(env))
    })
  }

  return joi.validateOrBoomAsync(opts, schemaObject)
}
/**
 * Used to validate the opts input when creating an instance
 * @param   {Object}   opts                        - opts object to make the
 * @param   {Boolean}  opts.autoForked             - true if this instance was autoforked
 * @param   {String}   opts.build                  - build model id (ObjectId)
 * @param   {[String]} opts.env                    - array of envs ['abc=123']
 * @param   {Object}   opts.ipWhitelist            - contains enabled, which when true, means the
 *                                                     container is disconnected from outside traffic
 * @param   {Boolean}  opts.isIsolationGroupMaster - true if this instance is the isolation master
 * @param   {String}   opts.isolated               - isolation model id (ObjectId)
 * @param   {Boolean}  opts.masterPod              - true if this instance is the masterpod
 * @param   {String}   opts.name                   - name of this instance
 * @param   {Object}   opts.owner                  - owner of this instance
 * @param   {Number}   opts.owner.github           - github id of the owner of this instance
 * @param   {String}   opts.parent                 - shortHash of the instance this was forked from
 * @param   {Boolean}  opts.public                 - true if this instance is public
 * @returns {Promise}  which resolves when the validation is complete
 * @resolves {null}
 * @throws  {Boom}     when the opts doesn't match validation
 */
InstanceService.validateCreateOpts = function (opts) {
  return InstanceService.validateOpts(createInstanceBodySchema, opts)
}

/**
 * Used to validate the opts input when creating an instance
 * @param   {Object}   opts                        - opts object to make the
 * @param   {Boolean}  opts.autoForked             - true if this instance was autoforked
 * @param   {String}   opts.build                  - build model id (ObjectId)
 * @param   {[String]} opts.env                    - array of envs ['abc=123']
 * @param   {Object}   opts.ipWhitelist            - contains enabled, which when true, means the
 *                                                     container is disconnected from outside traffic
 * @param   {Boolean}  opts.isIsolationGroupMaster - true if this instance is the isolation master
 * @param   {String}   opts.isolated               - isolation model id (ObjectId)
 * @param   {Boolean}  opts.masterPod              - true if this instance is the masterpod
 * @param   {String}   opts.name                   - name of this instance
 * @param   {Object}   opts.owner                  - owner of this instance
 * @param   {Number}   opts.owner.github           - github id of the owner of this instance
 * @param   {String}   opts.parent                 - shortHash of the instance this was forked from
 * @param   {Boolean}  opts.public                 - true if this instance is public
 * @returns {Promise}  which resolves when the validation is complete
 * @resolves {null}
 * @throws  {Boom}     when the opts doesn't match validation
 */
InstanceService.validateUpdateOpts = function (opts) {
  return InstanceService.validateOpts(updateInstanceBodySchema, opts)
}

/**
 * Given a opts object full of parameters, create an instance.  Once created, update the cv again
 * if necessary, add the hostname, generate the dependencies, then emit an instance update event
 *
 * @param    {Object}   opts                        - opts object from the route
 * @param    {Boolean}  opts.autoForked             - true if this instance was autoforked
 * @param    {String}   opts.build                  - build model id (ObjectId)
 * @param    {[String]} opts.env                    - array of envs ['abc=123']
 * @param    {Object}   opts.ipWhitelist            - contains enabled, which when true, means the
 *                                                      container is disconnected from outside traffic
 * @param    {Boolean}  opts.isIsolationGroupMaster - true if this instance is the isolation master
 * @param    {String}   opts.isolated               - isolation model id (ObjectId)
 * @param    {Boolean}  opts.masterPod              - true if this instance is the masterpod
 * @param    {String}   opts.name                   - name of this instance
 * @param    {Object}   opts.owner                  - owner of this instance
 * @param    {Number}   opts.owner.github           - github id of the owner of this instance
 * @param    {String}   opts.parent                 - shortHash of the instance this was forked from
 * @param    {Boolean}  opts.public                 - true if this instance is public
 * @param    {User}     sessionUser                 - the session user User model
 * @returns  {Promise}  when the instance has been created
 * @resolves {Instance} newly created instance
 * @throws   {Boom.notFound} When any of the mongo queries fails to return a value
 * @throws   {Boom.badRequest} When the contextVersion hasn't started building
 * @throws   {Boom.badImplementation} When the shortHash fails to generate
 * @throws   {Error} any other error
 */
InstanceService.createInstance = function (opts, sessionUser) {
  opts = pick(opts, [
    'autoForked',
    'build',
    'env',
    'ipWhitelist',
    'isIsolationGroupMaster',
    'isolated',
    'isTesting',
    'locked',
    'masterPod',
    'name',
    'owner',
    'parent',
    'public'
  ])
  var log = logger.log.child({
    sessionUser: sessionUser,
    opts: opts
  }, 'InstanceSchema.statics.createInstance')
  log.trace('call')
  return InstanceService.validateCreateOpts(opts)
    .then(function fetchBuild () {
      return Build.findByIdAsync(opts.build)
        .tap(function useBuildsOwner (build) {
          if (!build) {
            throw Boom.notFound('build not found')
          }
          if (!opts.owner) {
            opts.owner = build.owner
          }
        })
    })
    .then(function fetchNeededInstanceData (build) {
      return Promise.props({
        contextVersion: ContextVersion.findByIdAsync(keypather.get(build, 'contextVersion')),
        shortHash: InstanceCounter.nextHashAsync(),
        owner: sessionUser.findGithubUserByGithubIdAsync(keypather.get(opts, 'owner.github')),
        build: build
      })
    })
    .tap(function checkResultsForInstanceData (results) {
      log.trace({
        shortHash: results.shortHash,
        owner: keypather.get(results, 'owner.login')
      }, 'fetching owner and shortHash')

      if (!results.owner) {
        throw Boom.notFound('owner not found')
      } else if (!results.owner.login) {
        throw Boom.notFound('owner login info not found on Github')
      } else if (!results.contextVersion) {
        throw Boom.notFound('contextVersion not found')
      } else if (!keypather.get(results.contextVersion, 'build.started')) {
        throw Boom.badRequest('Cannot attach a build to an instance with context ' +
          'versions that have not started building')
      } else if (!results.shortHash) {
        throw Boom.badImplementation('failed to generate shortHash')
      }
    })
    .then(function createInstanceModel (results) {
      var ownerUsername = keypather.get(results, 'owner.login')
      opts = put(opts, {
        build: results.build._id,
        contextVersion: results.contextVersion.toJSON(),
        createdBy: {
          github: keypather.get(sessionUser, 'accounts.github.id'),
          gravatar: keypather.get(sessionUser, 'gravatar'),
          username: keypather.get(sessionUser, 'accounts.github.username')
        },
        lowerName: opts.name.toLowerCase(),
        owner: {
          github: opts.owner.github,
          gravatar: keypather.get(results.owner, 'avatar_url'),
          username: ownerUsername
        },
        shortHash: results.shortHash
      })
      return Instance.createAsync(opts)
        .then(function setHostnameOnInstanceModel (instance) {
          var hostname = instance.getElasticHostname(ownerUsername).toLowerCase()
          return Promise.props({
            instance: instance.setAsync({
              elasticHostname: hostname,
              hostname: hostname
            }),
            contextVersion: ContextVersion.findByIdAsync(instance.contextVersion._id)
          })
        })
    })
    .tap(function reAddContextVersionForRaceCondition (results) {
      log.trace({
        contextVersion: keypather.get(results, 'contextVersion._id')
      }, 'fetching cv, build, and hostname')
      if (!results.contextVersion) {
        throw Boom.notFound('contextVersion not found the second time')
      }
      // Fetch the contextVersion again, in case it finished building since we fetched it the first
      // time and when we saved it.
      if (keypather.get(results, 'contextVersion.build.completed.getTime()') !==
        keypather.get(results, 'instance.contextVersion.build.completed.getTime()')) {
        // we hit the race condition, so save the cv to the instance again
        return results.instance.setAsync({
          contextVersion: results.contextVersion.toJSON()
        })
      }
    })
    .then(function fireOffRabbitEventsIfBuildSuccessful (results) {
      return InstanceService._saveInstanceAndEmitUpdate(results.instance, results.contextVersion, opts, sessionUser)
    })
    .catch(function (err) {
      log.error({
        error: err
      }, 'Error during instance creation')
      throw err
    })
}

/**
 * Given an instance (with changes set to it), save it to the database, do required work for
 * dependencies, emit RabbitMQ jobs (instanceDeployed, createInstanceContainer), then finally emits
 * the post event to the UI
 * @param    {Instance}       instance          - Instance that was just modified (using set) and
 *                                                  ready to be saved into the database
 * @param    {ContextVersion} newContextVersion - ContextVersion that was just attached to the
 *                                                  instance. If the cv wasn't modified during this
 *                                                  update, this should be null
 * @param    {Object}         opts              - opts used to create or update the instance
 * @param    {[String]}       opts.env          - array of envs ['abc=123']
 * @param    {User}           sessionUser       - User model of the user of this session
 *
 * @returns  {Promise}       When the instance has finished emitting its update
 * @resolves {Instance}      The instance after it's saved
 *
 * @throws   {Boom.notFound} When any of the mongo queries fails to return a value
 * @private
 */
InstanceService._saveInstanceAndEmitUpdate = function (instance, newContextVersion, opts, sessionUser) {
  var log = logger.log.child({
    instance: instance,
    contextVersion: newContextVersion,
    opts: opts,
    sessionUser: sessionUser
  }, 'InstanceSchema._saveInstanceAndEmitUpdate')
  log.info('call')
  return instance.saveAsync()
    .tap(function (instance) {
      if (!instance) {
        throw Boom.notFound('instance not found')
      }
    })
    .tap(function (instance) {
      return instance.upsertIntoGraphAsync()
    })
    .tap(function (instance) {
      if (opts.env) {
        return instance.setDependenciesFromEnvironmentAsync(instance.owner.username)
      }
    })
    .tap(function (instance) {
      if (keypather.get(newContextVersion, 'isBuildSuccessful')) {
        log.trace('added successful build, creating container')
        var manual = keypather.get(newContextVersion, 'build.triggeredAction.manual')
        if (!manual) {
          log.trace('instance deployed')
          rabbitMQ.instanceDeployed({
            instanceId: instance._id.toString(),
            cvId: newContextVersion._id.toString()
          })
        }
        rabbitMQ.createInstanceContainer({
          instanceId: instance._id.toString(),
          contextVersionId: newContextVersion._id.toString(),
          sessionUserGithubId: sessionUser.accounts.github.id,
          ownerUsername: instance.owner.username
        })
      }
    })
    .tap(function (instance) {
      return instance.emitInstanceUpdateAsync(sessionUser, 'post')
    })
}

/**
 * Used by the instance update, this attaches the contextVersion onto the instance (doesn't save it,
 * just sets it) and emits all of the required Rabbit events.
 * (deleteContextVersion, deleteForkedInstancesByRepoAndBranch, deleteInstanceContainer, matchCommitWithIsolationMaster)
 * This also clears out the instance's container field, after it creates the deleteInstanceContainer
 * job.
 * @param    {Instance} instance                    - Instance model to update
 * @param    {Object}   opts                        - opts object from the route
 * @param    {String}   opts.build                  - build model id (ObjectId)
 * @param    {User}     sessionUser                 - the session user User model
 * @returns  {Promise}  when the new cv and build have been set on the instance, and the container cleared
 * @resolves {Instance} instance with the values freshly set
 * @private
 */
InstanceService._setNewContextVersionOnInstance = function (instance, opts, sessionUser) {
  var log = logger.log.child({
    instance: instance,
    opts: opts,
    sessionUser: sessionUser
  }, '_setNewContextVersionOnInstance')
  log.info('call')
  return Build.findByIdAsync(opts.build)
    .tap(function fetchCv (build) {
      if (!build) {
        throw Boom.notFound('build not found')
      }
      // delete opts.build since it will be added to the instance in the set at the bottom
      delete opts.build
    })
    .then(function (build) {
      return ContextVersion.findByIdAsync(build.contextVersion)
        .tap(function validateContextVersion (contextVersion) {
          if (!contextVersion) {
            throw Boom.notFound('contextVersion not found')
          }
          if (!keypather.get(contextVersion, 'build.started')) {
            throw Boom.badRequest('Cannot attach a build to an instance with context ' +
              'versions that have not started building')
          }
          if (keypather.get(contextVersion, 'owner.github') !== keypather.get(instance, 'owner.github')) {
            throw Boom.badRequest('Instance owner must match Build owner')
          }
        })
        .tap(function deleteOtherInstancesWithSameBranch (contextVersion) {
          // If this instance is a master instance, and the branch has changed, delete any
          // non-isolated, non-masterpod instances with the same branch
          if (instance.masterPod && (!opts.isolated && !instance.isolated)) {
            var currentMainACV = ContextVersion.getMainAppCodeVersion(keypather.get(instance, 'contextVersion.appCodeVersions'))
            var newMainACV = ContextVersion.getMainAppCodeVersion(contextVersion.appCodeVersions)

            // Only if the user changed the branch of a MasterPod should you delete others
            if (currentMainACV && newMainACV && currentMainACV.branch !== newMainACV.branch) {
              log.trace({
                'repo': newMainACV.lowerRepo,
                'branch': newMainACV.lowerBranch
              }, 'delete duplicate instance by repo and branch')
              return InstanceService.deleteForkedInstancesByRepoAndBranch(
                instance._id.toString(),
                newMainACV.lowerRepo,
                newMainACV.lowerBranch
              )
            }
          }
        })
        .tap(function deleteOldContextVersion (contextVersion) {
          var oldContextVersionId = keypather.get(instance, 'contextVersion._id.toString()')
          var newContextVersionId = contextVersion._id.toString()
          if (oldContextVersionId !== newContextVersionId) {
            log.trace({
              oldContextVersionId: oldContextVersionId,
              newContextVersionId: newContextVersionId
            }, 'delete old context version')
            return rabbitMQ.deleteContextVersion({
              contextVersionId: oldContextVersionId
            })
          }
        })
        .tap(function deleteOldDockerContainer () {
          if (keypather.get(instance, 'container.dockerContainer')) {
            log.trace('container found. delete container')
            return InstanceService.deleteInstanceContainer(instance, instance.container)
          }
        })
        .tap(function matchOtherIsolatedCommits () {
          if (instance.isolated && instance.isIsolationGroupMaster) {
            log.trace({
              isolationId: instance.isolated
            }, 'Commit matching enqueued for isolation')
            rabbitMQ.matchCommitWithIsolationMaster({
              isolationId: instance.isolated,
              sessionUserGithubId: keypather.get(sessionUser, 'accounts.github.id')
            })
          } else {
            log.trace({
              isolationId: instance.isolated
            }, 'Commit matching not enqueued. Instance not isolated.')
          }
        })
        .tap(function setNewCvOnInstanceAndClearContainer (contextVersion) {
          // set container to undefined, which is just like using $unset
          return instance.setAsync({
            build: build._id,
            contextVersion: contextVersion.toJSON(),
            container: undefined
          })
        })
    })
}

/**
 * Given a opts object full of parameters, update an instance.  If a new build (CV) is given, many
 * RabbitMQ jobs are fired (deleteContextVersion, deleteForkedInstancesByRepoAndBranch, deleteInstanceContainer),
 * the container is removed, and the CV and Build are applied to the instance.  Once that is done,
 * the Socket event is finally emitted
 *
 * @param    {Instance} instance                    - Instance model to update
 * @param    {Object}   opts                        - opts object from the route
 * @param    {String}   opts.build                  - build model id (ObjectId)
 * @param    {[String]} opts.env                    - array of envs ['abc=123']
 * @param    {Object}   opts.ipWhitelist            - contains enabled, which when true, means the
 *                                                      container is disconnected from outside traffic
 * @param    {Boolean}  opts.isIsolationGroupMaster - true if this instance is the isolation master
 * @param    {String}   opts.isolated               - isolation model id (ObjectId)
 * @param    {Boolean}  opts.locked                 - true if this instance is should freeze and
 *                                                      not auto-deploy
 * @param    {Boolean}  opts.public                 - true if this instance is public
 * @param    {User}     sessionUser                 - the session user User model
 *
 * @returns  {Promise}  when the instance has been created
 * @resolves {Instance} newly created instance
 *
 * @throws   {Boom.notFound} When any of the mongo queries fails to return a value
 * @throws   {Boom.badRequest} When the contextVersion hasn't started building, owners don't match
 * @throws   {Error} any other error
 */
InstanceService.updateInstance = function (instance, opts, sessionUser) {
  opts = pick(opts, [
    'build',
    'env',
    'ipWhitelist',
    'isIsolationGroupMaster',
    'isolated',
    'locked',
    'public'
  ])
  var log = logger.log.child({
    sessionUser: sessionUser,
    opts: opts
  }, 'InstanceSchema.statics.createInstance')
  log.trace('call')

  return InstanceService.validateUpdateOpts(opts)
    .then(function checkIfNewBuild () {
      if (opts.build) {
        return InstanceService._setNewContextVersionOnInstance(instance, opts, sessionUser)
      }
    })
    .tap(function setOptsOnInstance () {
      // Add the rest of the opts to the instance
      return instance.setAsync(opts)
    })
    .then(function updateInstance (newContextVersion) {
      // If a cv wasn't added, then this newContextVersion should be null
      return InstanceService._saveInstanceAndEmitUpdate(instance, newContextVersion, opts, sessionUser)
    })
    .catch(function (err) {
      log.error({
        error: err
      }, 'Error during instance update')
      throw err
    })
}

/**
 * Change the commit on an instance to the provided commit hash
 *
 * This is done by creating a new context version and a new build, and updating
 * the instance with the new CV/build.
 *
 * @param    {Object} instance     - Instance model object
 * @param    {String} commit       - Commmit hash for commit
 * @param    {Object} sessionUser  - User model object
 * @resolves {instance}
 * @returns  {Promise}
 */
InstanceService.updateInstanceCommitToNewCommit = function (instance, commit, sessionUser) {
  var log = logger.log.child({
    tx: true,
    commit: commit,
    instanceId: instance._id,
    sessionUser: sessionUser,
    method: 'updateInstanceCommitToNewCommit'
  })
  log.info('Start updateInstanceCommitToNewCommit')
  var userId = keypather.get(sessionUser, 'accounts.github.id')
  return Promise.try(function () {
    log.trace({
      instanceCV: instance.contextVersion
    }, 'Context Version found')
    var appCodeVersions = keypather.get(instance.contextVersion, 'appCodeVersions')
    var acv = ContextVersion.getMainAppCodeVersion(appCodeVersions)
    var repo = keypather.get(acv, 'repo')
    var branch = keypather.get(acv, 'branch')
    log.trace({
      acv: acv,
      repo: repo,
      branch: branch
    }, 'Checking repo an branch in old contextVersion')
    if (!repo || !branch) {
      throw new Error('ContextVersion has no repo and/or branch')
    }
    var pushInfo = {
      repo: acv.repo,
      branch: acv.branch,
      commit: commit,
      user: { id: userId }
    }
    log.trace({
      acv: acv,
      pushInfo: pushInfo
    }, 'Create and build new context version')
    return BuildService.createAndBuildContextVersion(instance, pushInfo, 'isolate')
  })
    .then(function (res) {
      var newContextVersionId = keypather.get(res, 'build.contextVersions[0]')
      log.trace({
        newContextVersionId: newContextVersionId
      }, 'Fetching Context Version')
      if (!res.build || !newContextVersionId) {
        throw new Error('Build and context version id required')
      }
      return [res.build, ContextVersion.findByIdAsync(newContextVersionId)]
    })
    .spread(function (newBuild, newContextVersion) {
      log.trace({
        newBuild: newBuild,
        userId: userId,
        newContextVersion: newContextVersion
      }, 'New build and context version created')
      if (!newContextVersion) {
        throw new Error('No new context version found')
      }
      log.trace('updateInstanceWithNewBuild with new build')
      return InstanceService.updateInstanceBuild(instance, {
        build: newBuild._id,
        contextVersion: newContextVersion.toJSON()
      }, userId)
    })
    .then(function (instance) {
      log.trace('emitInstanceUpdate')
      return InstanceService.emitInstanceUpdate(instance, userId, 'patch', true)
    })
}

/**
 * Utility function to call `rabbitMQ.deleteInstanceContainer`.
 * @param {Object} instance model that should be used to create `instance.container.delete` payload
 * @param {Object} container container that is going to be deleted
 * @retrun undefined
 */
InstanceService.deleteInstanceContainer = function (instance, container) {
  var branch = Instance.getMainBranchName(instance)
  rabbitMQ.deleteInstanceContainer({
    instanceShortHash: instance.shortHash,
    instanceName: instance.name,
    instanceMasterPod: instance.masterPod,
    instanceMasterBranch: branch,
    container: container,
    ownerGithubId: keypather.get(instance, 'owner.github'),
    ownerGithubUsername: keypather.get(instance, 'owner.username'),
    isolated: instance.isolated,
    isIsolationGroupMaster: instance.isIsolationGroupMaster
  })
}

/**
 * Check if instances share same masterPod of if one instance is another
 * instances child
 *
 * @param {Object} instanceA - Instance model object
 * @param {Object} instanceB - Instance model object
 * @return {Boolean}
 */
InstanceService.doInstancesShareSameMasterPod = function (instanceA, instanceB) {
  if (instanceA.masterPod && instanceB.masterPod) {
    return false
  }
  var shortHashA = instanceA.shortHash
  var shortHashB = instanceB.shortHash
  var parentA = instanceA.parent
  var parentB = instanceB.parent
  if (instanceA.masterPod && shortHashA === parentB) {
    return true
  }
  if (instanceB.masterPod && shortHashB === parentA) {
    return true
  }
  if (parentA === parentB) {
    return true
  }
  return false
}

/**
 * Find all forked instances that has specific main repo and branch deployed and
 * create `instance.delete` job for each of the found instances.
 * NOTE: this should not be called if `instanceId` is for isolated instance
 *
 * @param {Object} instance   - Instance model object. Shouldn't be deleted
 * @param {String} repo       - Repo name used for the instances search
 * @param {String} branch     - Branch name used for the instances search
 */
InstanceService.deleteForkedInstancesByRepoAndBranch = function (instance, repo, branch) {
  var log = logger.log.child({
    tx: true,
    method: 'InstanceService.deleteForkedInstancesByRepoAndBranch',
    instanceId: keypather.get(instance, '_id.toString()'),
    repo: repo,
    branch: branch
  })
  log.info('called')
  // do nothing if parameters are missing
  if (!keypather.get(instance, '_id') || !repo || !branch) {
    log.warn({
      instanceId: keypather.get(instance, '_id.toString()'),
      repo: repo,
      branch: branch
    }, 'missing inputs')
    return Promise.resolve()
  }
  return Instance.findForkedInstancesAsync(repo, branch)
    .then(function (instances) {
      if (instances && instances.length) {
        // If this instance is isolated, don't delete any other instance
        instances.forEach(function (inst) {
          // Don't delete any isolated instances or master instance
          if (
            !inst.isolated &&
            inst._id.toString() !== instance._id.toString() &&
            InstanceService.doInstancesShareSameMasterPod(instance, inst)
          ) {
            rabbitMQ.deleteInstance({
              instanceId: inst._id
            })
          }
        })
      }
    })
}

/**
 * Update instance with the build
 * @param {Object} instance - instance that should be patched with a new build
 * @param {Object} build - build that should be put on an instance
 * @returns {Promise}
 * @resolves updated instance model
 */
InstanceService.updateBuild = function (instance, build) {
  var logData = {
    tx: true,
    buildId: build._id,
    instanceId: instance._id
  }
  log.info(logData, 'InstanceService.updateBuild')
  return User.findByGithubIdAsync(instance.createdBy.github)
    .then(function (instanceCreator) {
      return InstanceService.updateInstance(instance, { build: build._id.toString() }, instanceCreator)
    })
}

/**
 * Update instances with the build. Instances should be found by repo and branch.
 * Build should be found by `cvId`
 * @param {String} repo - repo to search for the instances to update
 * @param {String} branch - branch to search for the instances to update
 * @param {String} cvId - context version id used to find instance
 * @returns {Promise}
 * @resolves with array of updted instances
 */
InstanceService.updateBuildByRepoAndBranch = function (repo, branch, cvId) {
  var logData = {
    tx: true,
    repo: repo,
    branch: branch,
    cvId: cvId
  }
  log.info(logData, 'InstanceService.updateBuildByRepoAndBranch')
  return Build.findByContextVersionIdsAsync([cvId]).then(function (builds) {
    if (!builds || !builds[0]) {
      log.trace(logData, 'updateBuildByRepoAndBranch no builds found')
      return
    }
    // NOTE: it seems like there is no case when array will have > 1 item
    var build = builds[0]
    return Instance.findInstancesLinkedToBranchAsync(repo, branch)
      .then(function (instances) {
        log.trace({ instances: instances }, 'updateBuildByRepoAndBranch found instances to update')
        return Promise.map(instances, function (instance) {
          return InstanceService.updateBuild(instance, build)
        })
      })
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
  var log = logger.log.child({
    tx: true,
    opts: opts,
    method: 'InstanceService.createContainer'
  })
  log.info('InstanceService.createContainer called')
  InstanceService._findInstanceAndContextVersion(opts, function (findErr, mongoData) {
    if (findErr) {
      log.error({err: findErr}, '_findInstanceAndContextVersion failed')
      return cb(findErr)
    }

    var createOpts = assign(mongoData, opts)
    InstanceService._createDockerContainer(createOpts, function (createErr, result) {
      if (createErr) {
        log.error({ err: createErr }, '_createDockerContainer failed')
        return cb(createErr)
      }

      cb(null, result)
    })
  })
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
    } else if (!objectId.equals(data.instance.contextVersion._id, data.contextVersion._id)) {
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
  var log = logger.log.child({
    tx: true,
    opts: opts,
    method: 'InstanceService._createDockerContainer'
  })

  log.info('_createDockerContainer called')
  var instance = opts.instance
  var contextVersion = opts.contextVersion

  var docker = new Docker()
  docker.createUserContainer(opts, function (err, container) {
    if (error.is4XX(err)) {
      // 4XX errs are not retryable, so mark db state
      log.error({ err: err }, 'finalCallback error')
      instance.modifyContainerCreateErr(contextVersion._id, err, function (err2) {
        if (err2) {
          log.error({ err: err2 }, 'finalCallback db error')
        }
        // if db write is successful, callback 4XX error
        // if db write was unsuccessful (err2), then callback err2 (500 error)
        cb(err2 || err)
      })
    } else if (err) { // 5XX err (non 4XX err)
      log.trace({ err: err }, 'finalCallback 5XX error')
      cb(err)
    } else {
      log.trace('finalCallback success')
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
 * @returns {Promise}
 * @resolves {Object} - Resolves instance object
 */
InstanceService.modifyExistingContainerInspect =
  function (instanceId, containerId, containerInspect, containerIp) {
    var log = logger.log.child({
      tx: true,
      instanceId: instanceId,
      containerId: containerId,
      containerInspect: containerInspect,
      containerIp: containerIp,
      method: 'InstanceService.modifyExistingContainerInspect'
    })
    // in case container_start event was processed check dockerContainer
    // otherwise dockerContainer would not exist
    var query = {
      _id: instanceId,
      'container.dockerContainer': containerId
    }
    log.info('called')
    return Instance.findOneAsync(query)
      .then(function (oldInstance) {
        if (!oldInstance) { // changed or deleted
          log.error({ query: query }, 'instance not found')
          throw Boom.conflict("Container was not updated, instance's container has changed")
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
        return Promise.fromCallback(function (cb) {
          InstanceService.updateContainerInspect(query, $set, cb)
        })
          .then(function (instance) {
            // NOTE: instance should always exist at this point
            // Any time the inspect data is to be updated we need to ensure the old
            // DNS entries for this container have been invalidated on the charon cache.
            // we should call invalidate on the old model  and not updated instance
            oldInstance.invalidateContainerDNS()
            return instance
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
            containerState: keypather.get(instance, 'container.inspect.State')
          }, logData), 'stopInstance publish stop job')
          rabbitMQ.stopInstanceContainer({
            containerId: instance.container.dockerContainer,
            instanceId: instance._id.toString(),
            sessionUserGithubId: sessionUserGithubId,
            tid: keypather.get(process.domain, 'runnableData.tid.toString()')
          })
          return instance
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
 * @param {String} tid - runnable transaction id.
 * NOTE: we don't want to polute our functions with tids. We will need to cleanup this and think of
 * a better way to pass transaction id
 * @returns {Promise}
 */
InstanceService.startInstance = function (instanceData, sessionUserGithubId, tid) {
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
      return Instance.markAsStartingAsync(instance._id, instance.container.dockerContainer)
        .then(function (instance) {
          log.trace(put({
            containerState: keypather.get(instance, 'container.inspect.State')
          }, logData), 'startInstance publish start job')
          rabbitMQ.startInstanceContainer({
            containerId: instance.container.dockerContainer,
            instanceId: instance._id.toString(),
            sessionUserGithubId: sessionUserGithubId,
            tid: tid
          })
          return instance
        })
    })
}

/**
 * Try to restart instance.
 * 1) Check if instance is starting or stopping.
 * 2) Create restart instance task
 * 3) Set Instance into starting state
 * @param {Instance} instanceData - Instance model data we are updating
 * @param {Number} sessionUserGithubId - github id of the session user
 * @returns {Promise}
 */
InstanceService.restartInstance = function (instanceData, sessionUserGithubId) {
  var logData = {
    tx: true,
    instance: instanceData,
    sessionUserGithubId: sessionUserGithubId
  }
  var instance = new Instance(instanceData)
  log.info(logData, 'InstanceService.restartInstance')
  return Promise.resolve()
    .then(function () {
      var containerId = keypather.get(instance, 'container.dockerContainer')
      if (!containerId) {
        throw Boom.badRequest('Instance does not have a container')
      }
    })
    .then(function () {
      log.trace(logData, 'restartInstance check state')
      return instance.isNotStartingOrStoppingAsync()
    })
    .then(function () {
      log.trace(logData, 'restartInstance marking as starting')
      return Instance.markAsStartingAsync(instance._id, instance.container.dockerContainer)
        .then(function (instance) {
          log.trace(put({
            containerState: keypather.get(instance, 'container.inspect.State')
          }, logData), 'restartInstance publish restart job')
          var tid = keypather.get(process.domain, 'runnableData.tid.toString()')
          rabbitMQ.restartInstance({
            containerId: instance.container.dockerContainer,
            instanceId: instance._id.toString(),
            sessionUserGithubId: sessionUserGithubId,
            tid: tid
          })
          return instance
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
    instance: instance._id,
    forceCvRefresh: forceCvRefresh
  }
  log.info(logData, 'InstanceService.emitInstanceUpdate')

  if (!userGithubId) {
    userGithubId = keypather.get(instance, 'createdBy.github')
  }

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
      return instance
    })
}

/**
 * Finds instances based on a cv.build.id, then populates the model and owner/created by in the
 * instance and emits the right event
 * @param {ObjectId|String} contextVersionBuildId - contextVersion.build.id to match instances with
 * @param {String}          eventName             - Event Name to emit
 * @param {Boolean}         forceCvRefresh        - If true will force a refresh of the context version
 * @returns {Promise} Resolves when all the found instances have emitted an update
 * @resolves {[Instances]} Instances that currently host a cv with this build info
 */
InstanceService.emitInstanceUpdateByCvBuildId = function (contextVersionBuildId, eventName, forceCvRefresh) {
  var logData = {
    tx: true,
    contextVersionBuildId: contextVersionBuildId,
    forceCvRefresh: forceCvRefresh
  }
  log.info(logData, 'InstanceService.emitInstanceUpdateByBuildId')
  return Instance.findByContextVersionBuildId(contextVersionBuildId)
    .then(function (instances) {
      if (Array.isArray(instances)) {
        if (!instances.length) {
          log.trace(logData, 'InstanceService.emitInstanceUpdateByBuildId found no instances')
        }
        return Promise.map(instances, function (instance) {
          return InstanceService.emitInstanceUpdate(instance, null, eventName, forceCvRefresh)
        })
      }
    })
}

/**
 * Try to kill instance.
 * 1) Check if instance is starting or stopping.
 * 2) Create kill instance task
 * 3) Set Instance into stopping state
 * @param {Instance} instanceData - Instance model data we are updating
 * @returns {Promise}
 * @resolves {undefined} this promise will not return anything
 */
InstanceService.killInstance = function (instanceData) {
  var log = logger.log.child({
    tx: true,
    instance: instanceData,
    method: 'InstanceService.killInstance'
  })
  log.info('called')
  return Promise.try(function () {
    log.trace('check state')
    var instanceModel = new Instance(instanceData)
    // If the instance is stopping its already on it's way to death
    // If the instance is starting we will have a race condition if we kill it right now
    // instead we need to wait for it to start, then the
    // start worker will kill based on conditions
    return instanceModel.isNotStartingOrStoppingAsync()
  })
    .then(function () {
      log.trace('marking as stopping')
      return Instance.markAsStoppingAsync(instanceData._id, instanceData.container.dockerContainer)
    })
    .then(function (instance) {
      log.trace({
        containerState: keypather.get(instance, 'container.inspect.State')
      }, 'publish kill job')
      rabbitMQ.killInstanceContainer({
        containerId: instance.container.dockerContainer,
        instanceId: instance._id.toString(),
        tid: keypather.get(process.domain, 'runnableData.tid.toString()') || uuid.v4()
      })
    })
}
