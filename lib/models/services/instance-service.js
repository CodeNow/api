/**
 * Instance service performs more complex actions related to the instances.
 * The service interacts not only with DB models but with other systems like
 * job queue.
 * @module lib/models/services/instance-service
 */

'use strict'
const clioClient = require('@runnable/clio-client')
const assign = require('101/assign')
const Boom = require('dat-middleware').Boom
const exists = require('101/exists')
const keypather = require('keypather')()
const pick = require('101/pick')
const Promise = require('bluebird')
const put = require('101/put')

const Build = require('models/mongo/build')
const BuildService = require('models/services/build-service')
const ContextVersion = require('models/mongo/context-version')
const ContextVersionService = require('models/services/context-version-service')
const Docker = require('models/apis/docker')
const error = require('error')
const formatObjectForMongo = require('utils/format-object-for-mongo')
const Instance = require('models/mongo/instance')
const InstanceCounter = require('models/mongo/instance-counter')
const joi = require('utils/joi')
const logger = require('logger')
const messenger = require('socket/messenger')
const PermissionService = require('models/services/permission-service')
const ClusterDataService = require('models/services/cluster-data-service')
const rabbitMQ = require('models/rabbitmq')
const User = require('models/mongo/user')

const ENV_REGEX = /^([A-z]+[A-z0-9_\.\-]*)=.*$/

function InstanceService () {}

module.exports = InstanceService

/**
 * Validates the options given to any of the RESTful instance services, like create and update, to
 * make sure everything in the object is valid before we straight-up save it to the database (since
 * we basically set the opts object on the instance).  This will also check for and remove any blank
 * env entries from the env in the opt.
 * @param    {Schema} schema - JOI validation model
 * @param    {Object} opts   - Options to be set onto an instance
 * @returns  {Promise}         After the validation is finished
 * @resolves {null}
 * @throws   {Boom.badRequest} When the opts fail the validation check
 */
InstanceService.validateAndPurifyOpts = function (schema, opts) {
  var schemaObject = joi.object(schema)
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
  return InstanceService.validateAndPurifyOpts({
    autoForked: joi.boolean(),
    aliases: joi.object().unknown(),
    build: joi.string().required(),
    clusterCreateId: joi.string(),
    containerStartCommand: joi.string(),
    env: joi.array().items(joi.string().regex(ENV_REGEX, 'envs')),
    ipWhitelist: joi.object({
      enabled: joi.boolean()
    }),
    isIsolationGroupMaster: joi.boolean(),
    isolated: joi.alternatives().try(joi.string(), joi.objectId()),
    isTesting: joi.boolean(),
    isTestReporter: joi.boolean(),
    masterPod: joi.boolean(),
    shortName: joi.string().required(),
    name: joi.string().regex(/^[-0-9a-zA-Z]+$/).required(),
    owner: joi.object({
      github: joi.alternatives().try(joi.number(), joi.string())
    }).unknown(),
    parent: joi.string(),
    ports: joi.array().items(joi.number()),
    public: joi.boolean(),
    hostname: joi.string(),
    locked: joi.boolean(),
    shouldNotAutofork: joi.boolean(),
    testingParentId: joi.string()
  }, opts)
}

/**
 * Used to validate the opts input when creating an instance
 * @param   {Object}   opts                        - opts object to make the
 * @param   {Boolean}  opts.autoForked             - true if this instance was autoforked
 * @param   {String}   opts.build                  - build model id (ObjectId)
 * @param   {[String]} opts.env                    - array of envs ['abc=123']
 * @param   {[Number]} opts.ports                  - array of ports [9090, 8080]
 * @param   {Boolean}  opts.hasAddedBranches       - (only for master instances) means this instance
 *                                                      has branch children
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
  return InstanceService.validateAndPurifyOpts({
    aliases: joi.object().unknown(),
    build: joi.string(),
    containerStartCommand: joi.string(),
    env: joi.array().items(joi.string().regex(ENV_REGEX, 'envs')),
    hasAddedBranches: joi.boolean(),
    ipWhitelist: joi.object({
      enabled: joi.boolean()
    }),
    isIsolationGroupMaster: joi.boolean(),
    isolated: joi.alternatives().try(joi.string(), joi.objectId()),
    isTesting: joi.boolean(),
    isTestReporter: joi.boolean(),
    public: joi.boolean(),
    ports: joi.array().items(joi.number()),
    locked: joi.boolean(),
    shouldNotAutofork: joi.boolean(),
    testingParentId: joi.string()
  }, opts)
}

/**
 * Given a opts object full of parameters, create an instance.  Once created, update the cv again
 * if necessary, add the hostname, generate the dependencies, then emit an instance update event
 *
 * @param    {Object}   opts                        - opts object from the route
 * @param    {Boolean}  opts.autoForked             - true if this instance was autoforked
 * @param    {String}   opts.build                  - build model id (ObjectId)
 * @param    {[String]} opts.env                    - array of envs ['abc=123']
 * @param    {[Number]} opts.ports                  - array of ports [9090, 8000]
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
 * @throws {User.NotFoundError}         When owner or owner.login not found
 * @throws {Build.NotFoundError}        When the build can't be found
 * @throws {ContextVersion.UnbuiltError}    When build has not started
 * @throws {Instance.CreateFailedError} When shorthash failed to generate
 */
InstanceService.createInstance = function (opts, sessionUser) {
  opts = pick(opts, [
    'autoForked',
    'aliases',
    'build',
    'containerStartCommand',
    'clusterCreateId',
    'env',
    'ipWhitelist',
    'isIsolationGroupMaster',
    'isolated',
    'isTesting',
    'isTestReporter',
    'locked',
    'masterPod',
    'shortName',
    'name',
    'owner',
    'parent',
    'ports',
    'public',
    'shouldNotAutofork',
    'testingParentId'
  ])
  const log = logger.child({
    sessionUser,
    opts,
    method: 'InstanceService.createInstance'
  })
  log.info('InstanceService.createInstance called')
  return InstanceService.validateCreateOpts(opts)
    .then(() => {
      return InstanceService._fetchBuild(opts)
    })
    .tap((build) => {
      return InstanceService._addOwnerToOptsFromBuildIfMissing(opts, build)
    })
    .then((build) => {
      return InstanceService._fetchNeededInstanceData(build, opts, sessionUser)
    })
    .tap((results) => {
      return InstanceService._checkResultsForInstanceData(results)
    })
    .then((results) => {
      return InstanceService._createInstanceModel(results, opts, sessionUser)
    })
    .tap((results) => {
      return InstanceService._reAddContextVersionForRaceCondition(results)
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
 * @param  {Object} opts
 * @param  {String} opts.build  mongoId of build we want to fetch
 * @return {Build}
 * @throws {Build.NotFoundError} When the build can't be found
 */
InstanceService._fetchBuild = (opts) => {
  return Build.findByIdAsync(opts.build)
    .tap((build) => {
      if (!build) {
        throw Build.NotFoundError(opts)
      }
    })
}

/**
 * Populate passed in opts object with owner of build
 * if it does not exist already
 * @param  {Object} opts
 * @param  {Object} build
 * @param  {String} build.owner
 * @return {undefined}
 */
InstanceService._addOwnerToOptsFromBuildIfMissing = (opts, build) => {
  if (!opts.owner) {
    opts.owner = {
      github: build.owner.github
    }
  }
}

/**
 * @param  {Build} build
 * @param  {String} build.contextVersion
 * @param  {Object} opts
 * @param  {String} opts.owner.github
 * @param  {SessionUser} sessionUser
 * @return {Object}
 *         {ContectVersion} .contextVersion
 *         {String} .shortHash
 *         {String} .owner
 *         {Build} .build
 */
InstanceService._fetchNeededInstanceData = (build, opts, sessionUser) => {
  return Promise.props({
    contextVersion: ContextVersionService.findContextVersion(keypather.get(build, 'contextVersion')),
    shortHash: InstanceCounter.nextHashAsync(),
    owner: sessionUser.findGithubUserByGithubIdAsync(keypather.get(opts, 'owner.github')),
    build: build
  })
}

/**
 * @param  {Object} opts
 * @param  {String} opts.owner.login
 * @param  {String} opts.shortHash
 * @param  {String} opts.contextVesrsion.build.started
 * @return {undefined}
 * @throws {User.NotFoundError}          When owner or owner.login not found
 * @throws {ContextVersion.UnbuiltError} When build has not started
 * @throws {Instance.CreateFailedError}  When shorthash failed to generate
 */
InstanceService._checkResultsForInstanceData = (opts) => {
  const log = logger.child({
    shortHash: opts.shortHash,
    owner: keypather.get(opts, 'owner.login')
  })
  log.trace('fetching owner and shortHash')

  let err = null
  if (!keypather.get(opts, 'owner.login')) {
    err = new User.NotFoundError(opts, 'attached to the instance', 'critical')
  } else if (!keypather.get(opts.contextVersion, 'build.started')) {
    err = new ContextVersion.UnbuiltError(opts.contextVersion)
  } else if (!opts.shortHash) {
    err = new Instance.CreateFailedError(opts)
  } else {
    // no errors, return!
    return
  }
  error.log(err, {
    opts: opts,
    cvId: keypather.get(opts, 'contextVersion._id'),
    method: 'InstanceCreate'
  })
  throw err
}

/**
 * @param  {Object} results
 * @param  {String} results.build._id
 * @param  {String} results.owner
 * @param  {String} results.shorthash
 * @param  {ContextVersion} results.contextVersion
 * @param  {Object} opts
 * @param  {String} opts.name
 * @param  {String} opts.owner.github
 * @param  {String} opts.owner.avatar_url
 * @param  {String} opts.owner.login
 * @param  {String} opts.testingParentId
 * @param  {SessionUser} sessionUser
 * @return {Instance}
 */
InstanceService._createInstanceModel = (results, opts, sessionUser) => {
  const log = logger.child({
    results,
    sessionUser
  })
  log.trace('_createInstanceModel called', { opts })
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
    aliases: opts.aliases || {},
    ports: opts.ports || [],
    owner: {
      github: opts.owner.github,
      gravatar: keypather.get(results.owner, 'avatar_url'),
      username: ownerUsername
    },
    shortHash: results.shortHash,
    testingParentId: opts.testingParentId
  })

  log.trace('creating instance', { opts })
  return Instance.createAsync(opts)
    .then(function setHostnameOnInstanceModel (instance) {
      var hostname = instance.getElasticHostname(ownerUsername).toLowerCase()
      return Promise.props({
        instance: instance.setAsync({
          elasticHostname: hostname,
          hostname: hostname
        }),
        contextVersion: ContextVersionService.findContextVersion(instance.contextVersion._id)
      })
    })
}

/**
 * @param  {Object} opts
 * @param  {String} opts.owner.login
 * @param  {ContextVersion} opts.contextVersion
 * @param  {Instance} opts.instance
 * @return {Instance}
 */
InstanceService._reAddContextVersionForRaceCondition = (opts) => {
  const log = logger.child({
    shortHash: opts.shortHash,
    owner: keypather.get(opts, 'owner.login'),
    contextVersion: keypather.get(opts, 'contextVersion._id')
  })
  log.trace('fetching cv, build, and hostname')
  // Fetch the contextVersion again, in case it finished building since we fetched it the first
  // time and when we saved it.
  if (keypather.get(opts, 'contextVersion.build.completed.getTime()') !==
    keypather.get(opts, 'instance.contextVersion.build.completed.getTime()')) {
    // we hit the race condition, so save the cv to the instance again
    return opts.instance.setAsync({
      contextVersion: opts.contextVersion.toJSON()
    })
  }
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
 * @throws   {Instance.CreateFailedError} When the instance.save fails
 * @throws   {Boom.notFound}              When any of the mongo queries fails to return a value
 * @private
 */
InstanceService._saveInstanceAndEmitUpdate = function (instance, newContextVersion, opts, sessionUser) {
  const log = logger.child({
    instance,
    contextVersion: newContextVersion,
    opts,
    sessionUser,
    method: 'InstanceService._saveInstanceAndEmitUpdate'
  })
  log.info('called')
  return instance.saveAsync()
    .tap(function (instance) {
      if (!instance) {
        throw new Instance.CreateFailedError('InstanceCreate: We somehow failed to create a shortHash')
      }
    })
    .tap(function (instance) {
      if (opts.env) {
        return instance.setDependenciesFromEnvironmentAsync(instance.owner.username)
      }
    })
    .tap(function (instance) {
      if (!keypather.get(newContextVersion, 'isBuildSuccessful')) {
        log.trace('context version is not finished building')
        return
      }
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
    })
    .tap(function (instance) {
      const sessionUserGithubId = sessionUser.accounts.github.id
      return InstanceService.emitInstanceUpdate(instance, sessionUserGithubId, 'post')
    })
}

/**
 * Used by the instance update, this attaches the contextVersion onto the instance (doesn't save it,
 * just sets it) and emits all of the required Rabbit events.
 * (deleteContextVersion, deleteForkedInstancesByRepoAndBranch, deleteContainer, matchCommitInIsolationInstances)
 * This also clears out the instance's container field, after it creates the deleteContainer
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
  var log = logger.child({
    instance: instance,
    method: 'InstanceService._setNewContextVersionOnInstance',
    opts: opts,
    sessionUser: sessionUser
  })
  log.info('InstanceService._setNewContextVersionOnInstance call')
  return Build.findByIdAsync(opts.build)
    .tap(function fetchCv (build) {
      if (!build) {
        throw Boom.notFound('build not found', opts)
      }
      // delete opts.build since it will be added to the instance in the set at the bottom

      delete opts.build
    })
    .then(function (build) {
      return ContextVersionService.findContextVersion(build.contextVersion)
        .tap(function validateContextVersion (contextVersion) {
          if (!keypather.get(contextVersion, 'build.started')) {
            throw Boom.badRequest('Cannot attach a build to an instance with context ' +
              'versions that have not started building', {
                instanceId: keypather.get(instance, '_id'),
                cvId: keypather.get(contextVersion, '_id')
              })
          }
          const instanceOwner = keypather.get(instance, 'owner.github')
          if (PermissionService.isContextVersionOwner(instanceOwner, contextVersion)) {
            throw Boom.badRequest('Instance owner must match context version owner', {
              instanceId: keypather.get(instance, '_id'),
              cvId: keypather.get(contextVersion, '_id')
            })
          }
        })
        .tap(function deleteOtherInstancesWithSameBranch (contextVersion) {
          // If this instance is a master instance, and the branch has changed, delete any
          // non-isolated, non-masterpod instances with the same branch
          if (!instance.masterPod || opts.isolated || instance.isolated) {
            log.trace({
              repo: instance.masterPod,
              optIsolated: opts.isolated,
              instanceIsolated: instance.isolated
            }, 'Don\'t delete other instances with the same branch')
            return
          }
          var currentMainACV = ContextVersion.getMainAppCodeVersion(keypather.get(instance, 'contextVersion.appCodeVersions'))
          var newMainACV = ContextVersion.getMainAppCodeVersion(contextVersion.appCodeVersions)
          // Only if the user changed the branch of a MasterPod should you delete others
          if (!currentMainACV || !newMainACV || currentMainACV.branch === newMainACV.branch) {
            log.trace('Main ACV branch did not change')
            return
          }
          log.trace({
            repo: newMainACV.lowerRepo,
            branch: newMainACV.lowerBranch
          }, 'delete duplicate instance by repo and branch')
          return InstanceService.deleteForkedInstancesByRepoAndBranch(
            instance._id.toString(),
            newMainACV.lowerRepo,
            newMainACV.lowerBranch
          )
        })
        .tap(function deleteOldContextVersion (contextVersion) {
          var oldContextVersionId = keypather.get(instance, 'contextVersion._id.toString()')
          var newContextVersionId = contextVersion._id.toString()
          if (oldContextVersionId === newContextVersionId) {
            log.trace('ContextVersion didn\'t change')
            return
          }
          log.trace({
            oldContextVersionId: oldContextVersionId,
            newContextVersionId: newContextVersionId
          }, 'delete old context version')
          return rabbitMQ.deleteContextVersion({
            contextVersionId: oldContextVersionId
          })
        })
        .tap(function deleteOldDockerContainer () {
          if (keypather.get(instance, 'container.dockerContainer')) {
            log.trace('container found. delete container')
            return rabbitMQ.deleteContainer({
              containerId: keypather.get(instance, 'container.dockerContainer')
            })
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
        .tap(function matchOtherIsolatedCommits () {
          // Match commit only after new ACV has been set
          var isManual = keypather.get(instance, 'contextVersion.build.triggeredAction.manual')
          // Only match commit for isolated instances manually updated
          if (instance.isolated && isManual) {
            log.trace({
              isolationId: instance.isolated
            }, 'Isolated, enqueing job to match relative isolated instances with same commit')
            return rabbitMQ.matchCommitInIsolationInstances({
              isolationId: instance.isolated.toString(),
              instanceId: instance._id.toString(),
              sessionUserGithubId: keypather.get(sessionUser, 'accounts.github.id')
            })
          }
          log.trace({
            isolationId: instance.isolated
          }, 'Instance is not isolated')
        })
    })
}

/**
 * Given a opts object full of parameters, update an instance.  If a new build (CV) is given, many
 * RabbitMQ jobs are fired (deleteContextVersion, deleteForkedInstancesByRepoAndBranch, deleteContainer),
 * the container is removed, and the CV and Build are applied to the instance.  Once that is done,
 * the Socket event is finally emitted
 *
 * @param    {Instance} instance                    - Instance model to update
 * @param    {Object}   opts                        - opts object from the route
 * @param    {String}   opts.build                  - build model id (ObjectId)
 * @param    {String}   opts.containerStartCommand    - run command for the container
 * @param    {[String]} opts.env                    - array of envs ['abc=123']
 * @param    {[Number]} opts.ports                  - array of ports [9090, 8000]
 * @param    {Boolean}  opts.hasAddedBranches       - (only for master instances) means this instance
 *                                                      has branch children
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
 * @throws   {Boom.badRequest} When `shouldNotAutofork` is passed for an instance that's not a masterpod
 * @throws   {Error} any other error
 */
InstanceService.updateInstance = function (instance, opts, sessionUser) {
  opts = pick(opts, [
    'aliases',
    'build',
    'containerStartCommand',
    'env',
    'hasAddedBranches',
    'ipWhitelist',
    'isIsolationGroupMaster',
    'isolated',
    'isTesting',
    'isTestReporter',
    'locked',
    'public',
    'ports',
    'shouldNotAutofork',
    'testingParentId'
  ])
  const log = logger.child({
    sessionUser,
    opts,
    method: 'InstanceService.statics.updateInstance'
  })
  log.info('called')
  return InstanceService.validateUpdateOpts(opts)
    .then(function checkIfNewBuild () {
      if (opts.build) {
        return InstanceService._setNewContextVersionOnInstance(instance, opts, sessionUser)
      }
    })
    .tap(function setOptsOnInstance () {
      if (!instance.masterPod && opts.shouldNotAutofork) {
        throw Boom.badRequest('`shouldNotAutofork` should not be set on an instance that is not a masterPod', {
          instanceId: instance._id
        })
      }
      // Add the rest of the opts to the instance
      return instance.setAsync(opts)
    })
    .then(function updateInstance (newContextVersion) {
      // If a cv wasn't added, then this newContextVersion should be null
      return InstanceService._saveInstanceAndEmitUpdate(instance, newContextVersion, opts, sessionUser)
    })
    .tap(function setIsolatedInstancesLocked () {
      if (!exists(opts.locked)) {
        log.trace({
          locked: opts.locked,
          isolated: instance.isolated
        }, '`locked` property not set')
        return
      }
      return InstanceService.updateAllInstancesInIsolationWithSameRepoAndBranch(
        instance,
        { locked: opts.locked },
        sessionUser
      )
    })
    .catch(function (err) {
      log.error({
        error: err
      }, 'Error during instance update')
      throw err
    })
}

/**
 * Update properties on all instances with same repo
 *
 * @param {Object}    instance          - Instance model
 * @param {ObjectId}  instance.isolated - ObjectId for isolation
 * @param {Object}    opts              - Object with updates to be applied
 * @param {Object}    sessionUser       - Session user
 * @return {Promise}
 */
InstanceService.updateAllInstancesInIsolationWithSameRepoAndBranch = Promise.method(function (instance, opts, sessionUser) {
  var log = logger.child({
    opts: opts,
    instanceId: instance._id,
    sessionUser: sessionUser,
    method: 'updateAllInstancesInIsolationWithSameRepoAndBranch '
  })
  log.info('updateAllInstancesInIsolationWithSameRepoAndBranch called')

  if (!instance.isolated) {
    log.trace({
      isolated: instance.isolated
    }, 'Instance is not isolated')
    return
  }
  var mainACV = ContextVersion.getMainAppCodeVersion(keypather.get(instance, 'contextVersion.appCodeVersions'))
  if (!mainACV) {
    log.trace('No appCodeVersion found for this instance')
    return
  }

  log.trace({
    isolated: instance.isolated,
    repo: mainACV.repo,
    branch: mainACV.branch
  }, 'Find instances in same isolation with same repo')
  return Instance.findInstancesInIsolationWithSameRepoAndBranchAsync(instance.isolated, mainACV.repo, mainACV.branch)
    .then(function (instances) {
      instances = instances.filter(function (i) {
        if (!i || !i._id) return false
        return i._id.toString() !== instance._id.toString()
      })
      return Promise.map(instances, function (isolationInstance) {
        log.trace({
          instanceId: isolationInstance._id.toString(),
          opts: opts
        }, 'Update instance with new properties')
        return isolationInstance.updateAsync(opts)
          .tap(function () {
            log.trace({
              instanceId: isolationInstance._id.toString()
            }, 'emitInstanceUpdate for isolation instance')
            const sessionUserGithubId = sessionUser.accounts.github.id
            return InstanceService.emitInstanceUpdate(isolationInstance, sessionUserGithubId, 'update')
          })
      })
    })
})

/**
 * Change the commit on an instance to the provided commit hash
 *
 * This is done by creating a new context version and a new build, and updating
 * the instance with the new CV/build.
 *
 * @param    {Object} instance     - Instance model object
 * @param    {String} commit       - Commit hash for commit
 * @param    {Object} sessionUser  - User model object
 * @resolves {instance}
 * @returns  {Promise}
 */
InstanceService.updateInstanceCommitToNewCommit = function (instance, commit, sessionUser) {
  var log = logger.child({
    commit: commit,
    instanceId: instance._id,
    sessionUser: sessionUser,
    method: 'updateInstanceCommitToNewCommit'
  })
  log.info('Start updateInstanceCommitToNewCommit')
  var userId = keypather.get(sessionUser, 'accounts.github.id')
  return Promise.try(function () {
    log.trace({
      contextVersion: instance.contextVersion
    }, 'Context Version found')
    var appCodeVersions = keypather.get(instance, 'contextVersion.appCodeVersions')
    var acv = ContextVersion.getMainAppCodeVersion(appCodeVersions)
    var repo = keypather.get(acv, 'repo')
    var branch = keypather.get(acv, 'branch')
    log.trace({
      acv: acv,
      repo: repo,
      branch: branch
    }, 'Checking repo an branch in old contextVersion')
    if (!repo || !branch) {
      throw new Error('ContextVersion has no repo and/or branch', {
        cvId: keypather.get(instance, 'contextVersion._id')
      })
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
      var newBuildId = keypather.get(res, 'build._id')
      log.trace({
        newContextVersionId: newContextVersionId,
        newBuildId: newBuildId
      }, 'updating instance with new build')
      if (!newBuildId || !newContextVersionId) {
        throw new Error('Build and context version id required', {
          instanceId: instance._id,
          buildId: newBuildId,
          cvId: newContextVersionId
        })
      }
      return InstanceService.updateInstance(instance, { build: newBuildId }, sessionUser)
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
  var log = logger.child({
    method: 'InstanceService.deleteForkedInstancesByRepoAndBranch',
    instanceId: keypather.get(instance, '_id.toString()'),
    repo,
    branch
  })
  log.info('InstanceService.deleteForkedInstancesByRepoAndBranch call')
  const instanceId = keypather.get(instance, '_id.toString()')
  // do nothing if parameters are missing
  if (!instanceId || !repo || !branch) {
    log.warn({ instanceId, repo, branch }, 'missing inputs')
    return Promise.resolve()
  }
  return Instance.findNonIsolatedForkedInstances(repo, branch)
    .then(function (instances) {
      if (instances && instances.length) {
        // If this instance is isolated, don't delete any other instance
        instances.forEach(function (inst) {
          // Don't delete any isolated instances or master instance
          if (
            !inst.isolated &&
            inst._id.toString() !== instanceId &&
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
  var log = logger.child({
    method: 'InstanceService.updateBuild',
    buildId: build._id,
    instanceId: instance._id
  })
  log.info('InstanceService.updateBuild called')
  return User.findByGithubIdAsync(instance.createdBy.github)
    .then(function (instanceCreator) {
      return InstanceService.updateInstance(instance, { build: build._id.toString() }, instanceCreator)
    })
}

/**
 * Update instances with the build. Instances should be found by repo and branch.
 * Build should be found by `cvId`
 * @param {Object} contextVersion - context version model
 * @param {String} repo           - repo to search for the instances to update
 * @param {String} branch         - branch to search for the instances to update
 * @returns {Promise}
 * @resolves {Array}              - array of updated instances
 */
InstanceService.updateBuildByRepoAndBranchForAutoDeploy = function (contextVersion, repo, branch) {
  var log = logger.child({
    method: 'InstanceService.updateBuildByRepoAndBranchForAutoDeploy',
    repo: repo,
    branch: branch,
    contextVersionId: keypather.get(contextVersion, '_id.toString()')
  })
  var contextVersionId = keypather.get(contextVersion, '_id')
  log.info('called')
  return Build.findByContextVersionIdsAsync([contextVersionId])
    .then(function (builds) {
      if (!builds || !builds[0]) {
        log.trace('no builds found')
        return
      }
      // NOTE: it seems like there is no case when array will have > 1 item
      const build = builds[0]
      const buildHash = keypather.get(contextVersion, 'build.hash')
      const hasBuildDockerfilePath = !!keypather.get(contextVersion, 'buildDockerfilePath')
      return Instance.findInstancesForBranchAndBuildHash(repo, branch, contextVersion.context.toString(), buildHash, hasBuildDockerfilePath)
        .then(function (instances) {
          log.trace({ instances: instances }, 'found instances for branch and hash')
          // Don't automatically update to older builds.
          const instancesToUpdate = instances.filter(function (instance) {
            // Only move instances FORWARD automatically
            // Mongo id's are comparable by date, so this #justworks
            return instance.contextVersion.id < build.contextVersions[0]
          })
          log.trace({ instances: instancesToUpdate }, 'filtered instances preventing automatically rolling backwards')
          return Promise.map(instancesToUpdate, function (instance) {
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
  var log = logger.child({
    method: 'InstanceService.deleteAllInstanceForks',
    instance: instance
  })
  log.info('InstanceService.deleteAllInstanceForks called')
  if (!instance.masterPod) {
    // return empty array since nothing was deleted
    log.trace('nothing to delete')
    return Promise.resolve([])
  }

  return Instance.findInstancesByParentAsync(instance.shortHash)
    .then(function (instances) {
      instances.forEach(function (fork) {
        rabbitMQ.deleteInstance({
          instanceId: fork._id.toString()
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
 * @param  {Object}  contextVersion - context version
 * @result {Promise}
 */
InstanceService.createContainer = function (opts, contextVersion) {
  const log = logger.child({
    opts: opts,
    method: 'InstanceService.createContainer'
  })
  log.info('InstanceService.createContainer call')
  return InstanceService._findInstance(opts)
    .then(function (instance) {
      const createOpts = assign({ instance, contextVersion }, opts)
      return Promise.fromCallback(function (cb) {
        InstanceService._createDockerContainer(createOpts, function (createErr, result) {
          if (createErr) {
            log.error({ err: createErr }, '_createDockerContainer failed')
            return cb(createErr)
          }

          cb(null, result)
        })
      })
    })
}

/**
 * find one instance
 * @param  {Object}          opts
 * @param  {ObjectId|String} opts.instanceId instance id
 * @param  {ObjectId|String} opts.contextVersionId context version id
 * @return {Promise}
 * @resolves {Instance} found Instance
 */
InstanceService._findInstance = function (opts) {
  const log = logger.child({
    method: 'InstanceService._findInstance',
    opts: opts
  })
  log.info('InstanceService._findInstance called')
  const instanceId = opts.instanceId
  const contextVersionId = opts.contextVersionId
  const instanceQuery = {
    '_id': instanceId,
    'container': {
      $exists: false
    },
    'contextVersion.id': contextVersionId
  }
  return Instance.findOneAsync(instanceQuery)
    .tap(function (instance) {
      if (!instance) {
        throw new Instance.NotFoundError(instanceQuery)
      }
    })
    .tap(function (instance) {
      if (!instance.parent) {
        return instance
      }
      log.trace({ instance: instance }, 'check if parent exists')
      return Instance.findOneByShortHashAsync(instance.parent)
        .then(function (parent) {
          if (!parent) {
            const err = new Instance.NotFoundError({ shortHash: instance.parent })
            log.error('parent lookup error: not found')
            throw err
          }
          return instance
        })
    })
}

/**
 * create docker container for instance and cv
 * @param  {Object}   opts     [description]
 * @param  {Object}   opts.instance instance which the container belongs
 * @param  {Object}   opts.contextVersion contextVersion's image
 * @param  {Object}   opts.ownerUsername instance owner's username
 * @param  {Object}   opts.sessionUserGithubId session user's github id
 * @param  {Function} cb            callback
 */
InstanceService._createDockerContainer = function (opts, cb) {
  const log = logger.child({
    method: 'InstanceService._createDockerContainer',
    opts: opts
  })
  log.info('InstanceService._createDockerContainer call')
  const instance = opts.instance
  const contextVersion = opts.contextVersion

  const docker = new Docker()
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
      return cb(err)
    } else {
      log.trace('finalCallback success')
      return cb(null, container)
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
  var log = logger.child({
    method: 'InstanceService.updateContainerInspect',
    query: query,
    setObject: setObject
  })
  log.info('InstanceService.updateContainerInspect called')
  // Note: inspect may have keys that contain dots.
  //  Mongo does not support dotted keys, so we remove them.

  // We don't want the base keys to be formatted because $set can take root-level dots
  Object.keys(setObject).forEach(function (key) {
    formatObjectForMongo(setObject[key])
  })
  Instance.findOneAndUpdate(query, { $set: setObject }, function (err, instance) {
    if (err) {
      log.error({ err: err }, 'error')
      return cb(err)
    }
    if (!instance) { // changed or deleted
      log.error('error instance not found')
      return cb(Boom.conflict("Container was not updated, instance's container has changed"))
    }
    log.trace('success')
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
    var log = logger.child({
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
    log.info('modifyExistingContainerInspect call')
    return Instance.findOneAsync(query)
      .then(function (oldInstance) {
        if (!oldInstance) { // changed or deleted
          log.error({ query: query }, 'instance not found')
          throw Boom.conflict("Container was not updated, instance's container has changed", {
            query: query
          })
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
        .finally(function () {
          // NOTE: instance should always exist at this point
          // Any time the inspect data is to be updated we need to ensure the old
          // DNS entries for this container have been invalidated on the charon cache.
          // we should call invalidate on the old model and not updated instance
          oldInstance.invalidateContainerDNS()
        })
      })
  }

/**
 * Find instance by `instanceShortHash`
 * @param {String} instanceShortHash - short hash to find instance
 * @returns {Promise}
 * @resolves {Object} instance mongo model
 * @throws   {Instance.NotFoundError} When instance lookup failed
 * @throws   {Error}                  When Mongo fails
 */
InstanceService.findInstance = function (instanceShortHash) {
  const log = logger.child({
    method: 'InstanceService.findInstance',
    instanceShortHash: instanceShortHash
  })
  log.info('InstanceService.findInstance called')
  return Instance.findOneByShortHashAsync(instanceShortHash)
    .tap(function (instance) {
      if (!instance) {
        throw new Instance.NotFoundError({
          shortHash: instanceShortHash
        })
      }
    })
}

/**
 * Find instance by ObjectId
 * @param {ObjectId} instanceId - id instance
 * @returns {Promise}
 * @resolves {Instance} instance mongo model
 * @throws   {Instance.NotFoundError} When instance lookup failed
 * @throws   {Error}                  When Mongo fails
 */
InstanceService.findInstanceById = function (instanceId) {
  const log = logger.child({
    method: 'InstanceService.findInstance',
    instanceId: instanceId
  })
  log.info('InstanceService.findInstance called')
  return Instance.findByIdAsync(instanceId)
    .tap(function (instance) {
      if (!instance) {
        throw new Instance.NotFoundError({
          instanceId: instanceId
        })
      }
    })
}

/**
 * Try to stop instance.
 * 1) Find instance
 * 2) Check permissions
 * 3) Fetch instance submodels
 * 4) Check if instance is starting or stopping.
 * 5) Create stop instance task
 * 6) Set Instance into stopping state
 * @param {String} instanceShortHash - Instance short hash id data we are updating
 * @param {Object} sessionUser - session user mongo model
 * @returns {Promise}
 */
InstanceService.stopInstance = function (instanceShortHash, sessionUser) {
  const log = logger.child({
    method: 'InstanceService.stopInstance',
    instanceShortHash: instanceShortHash,
    sessionUser: sessionUser
  })
  log.info('InstanceService.stopInstance')
  return InstanceService.findInstance(instanceShortHash)
    .tap(function (instance) {
      return PermissionService.ensureOwnerOrModerator(sessionUser, instance)
    })
    .tap(function (instance) {
      log.trace({ instance: instance }, 'check if container exists')
      var containerId = keypather.get(instance, 'container.dockerContainer')
      if (!containerId) {
        log.error('Instance does not have a container')
        throw Boom.badRequest('Instance does not have a container', {
          instanceId: instance._id,
          containerId: containerId
        })
      }
    })
    .tap(Instance.assertNotStartingOrStopping)
    .then(function (instance) {
      log.trace({ instance: instance }, 'checks passed stopInstance marking as stopping')
      return Instance.markAsStoppingAsync(instance._id, instance.container.dockerContainer)
        .then(function (instance) {
          log.trace({
            containerState: keypather.get(instance, 'container.inspect.State')
          }, 'stopInstance publish stop job')
          rabbitMQ.stopInstanceContainer({
            containerId: instance.container.dockerContainer,
            instanceId: instance._id.toString(),
            sessionUserGithubId: keypather.get(sessionUser, 'accounts.github.id')
          })
          return instance
        })
    })
}

/**
 * Try to start instance.
 * 1) Find instance
 * 2) Check permissions
 * 3) Fetch instance submodels
 * 4) Check if instance is starting or stopping.
 * 5) Create start instance task
 * 6) Set Instance into starting state
 * @param {String} instanceShortHash - Instance short hash id data we are updating
 * @param {Object} sessionUser - session user mongo model
 * @returns {Promise}
 */
InstanceService.startInstance = function (instanceShortHash, sessionUser) {
  var log = logger.child({
    method: 'InstanceService.startInstance',
    instanceShortHash: instanceShortHash,
    sessionUser: sessionUser
  })
  log.info('InstanceService.startInstance called')
  return InstanceService.findInstance(instanceShortHash)
    .tap(function (instance) {
      return PermissionService.ensureOwnerOrModerator(sessionUser, instance)
    })
    .tap(function (instance) {
      log.trace({ instance: instance }, 'check if container exists')
      var containerId = keypather.get(instance, 'container.dockerContainer')
      if (!containerId) {
        log.error('Instance does not have a container')
        throw Boom.badRequest('Instance does not have a container', {
          instanceId: instance._id,
          containerId: containerId
        })
      }
    })
    .tap(Instance.assertNotStartingOrStopping)
    .then(function (instance) {
      log.trace({ instance: instance }, 'checks passed')
      var dockRemoved = keypather.get(instance, 'contextVersion.dockRemoved')
      var sessionUserGithubId = keypather.get(sessionUser, 'accounts.github.id.toString()')
      if (dockRemoved) {
        log.trace('dockRemoved: need to redeploy')
        rabbitMQ.redeployInstanceContainer({
          instanceId: instance._id.toString(),
          sessionUserGithubId: sessionUserGithubId
        })

        return instance
      }

      log.trace('marking as starting')
      return Instance.markAsStartingAsync(instance._id, instance.container.dockerContainer)
        .then(function (instance) {
          log.trace({
            containerState: keypather.get(instance, 'container.inspect.State')
          }, 'publish start job')
          rabbitMQ.startInstanceContainer({
            containerId: instance.container.dockerContainer,
            instanceId: instance._id.toString(),
            sessionUserGithubId: sessionUserGithubId
          })
          return instance
        })
    })
}

/**
 * Try to restart instance.
 * 1) Find instance
 * 2) Check permissions
 * 3) Fetch instance submodels
 * 4) Check if instance is starting or stopping.
 * 5) Create restart instance task
 * 6) Set Instance into starting state
 * @param {String} instanceShortHash - Instance short hash id data we are updating
 * @param {Object} sessionUser - session user mongo model
 * @returns {Promise}
 */
InstanceService.restartInstance = function (instanceShortHash, sessionUser) {
  var log = logger.child({
    method: 'InstanceService.restartInstance',
    instanceShortHash: instanceShortHash,
    sessionUser: sessionUser
  })
  log.info('InstanceService.restartInstance called')
  return InstanceService.findInstance(instanceShortHash)
    .tap(function (instance) {
      return PermissionService.ensureOwnerOrModerator(sessionUser, instance)
    })
    .tap(function (instance) {
      log.trace({ instance: instance }, 'check if container exists')
      var containerId = keypather.get(instance, 'container.dockerContainer')
      if (!containerId) {
        log.error('Instance does not have a container')
        throw Boom.badRequest('Instance does not have a container', {
          instanceId: instance._id,
          containerId: containerId
        })
      }
    })
    .tap(Instance.assertNotStartingOrStopping)
    .then(function (instance) {
      log.trace({ instance: instance }, 'checks passed, marking as starting')
      return Instance.markAsStartingAsync(instance._id, instance.container.dockerContainer)
        .then(function (instance) {
          log.trace({
            containerState: keypather.get(instance, 'container.inspect.State')
          }, 'publish restart job')
          rabbitMQ.restartInstance({
            containerId: instance.container.dockerContainer,
            instanceId: instance._id.toString(),
            sessionUserGithubId: keypather.get(sessionUser, 'accounts.github.id')
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
 * @returns {Promise}
 */
InstanceService.emitInstanceUpdate = function (instance, userGithubId, eventName) {
  userGithubId = userGithubId || keypather.get(instance, 'createdBy.github')
  var log = logger.child({
    method: 'InstanceService.emitInstanceUpdate',
    userGithubId: userGithubId,
    instance: instance._id
  })
  log.info('InstanceService.emitInstanceUpdate called')

  if (!userGithubId) {
    userGithubId = keypather.get(instance, 'createdBy.github')
  }

  return User.findByGithubIdAsync(userGithubId)
    .then(function (user) {
      var populationPromises = [
        InstanceService.populateInstanceModels(instance),
        instance.populateOwnerAndCreatedByAsync(user)
      ]
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
 * @returns {Promise} Resolves when all the found instances have emitted an update
 * @resolves {[Instances]} Instances that currently host a cv with this build info
 */
InstanceService.emitInstanceUpdateByCvBuildId = function (contextVersionBuildId, eventName) {
  var log = logger.child({
    method: 'InstanceService.emitInstanceUpdateByCvBuildId',
    contextVersionBuildId: contextVersionBuildId
  })
  log.info('InstanceService.emitInstanceUpdateByBuildId called')
  return Instance.findByContextVersionBuildId(contextVersionBuildId)
    .then(function (instances) {
      if (Array.isArray(instances)) {
        if (!instances.length) {
          log.trace('found no instances')
          return Promise.resolve([])
        }
        return Promise.map(instances, function (instance) {
          return InstanceService.emitInstanceUpdate(instance, null, eventName)
        })
      } else {
        log.warn('should have gotten an array')
      }
    })
}

/**
 * Fetch fully popu;ated instances based on a `query`
 * @param {Object} query - mongoose query to fetch instances
 * @param {Object} sessionUser mongo user model
 * @returns {Promise}
 * @resolves {Array} array of populated instances
 * @throws   {Instance.NotFoundError} When instances lookup failed
 */
InstanceService.fetchInstances = function (query, sessionUser) {
  const log = logger.child({
    query,
    sessionUser,
    method: 'InstanceService.fetchInstances'
  })
  log.info('called')
  return Instance.findAsync(query, { 'contextVersion.build.log': false })
    .then((instances) => {
      return Instance.populateOwnerAndCreatedByForInstancesAsync(sessionUser, instances)
    })
    .then((instances) => {
      log.trace('populating instances')
      return InstanceService.populateModels(instances, sessionUser)
    })
    .tap((instances) => {
      log.trace('populated instances')
    })
}

InstanceService.findInstanceByBranchName = function (githubId, branchName) {
  const log = logger.child({
    branchName,
    githubId,
    method: 'InstanceService.findInstanceByBranchName'
  })
  log.info('called')
  if (githubId) {
    return Instance.aggregateAsync([
      {
        '$match': {
          'owner.github': +githubId,
          name: branchName
        }
      }
    ])
      .then((instances) => {
        return instances
      })
  }
  return Instance.aggregateAsync([
    {
      '$match': {
        name: branchName
      }
    }
  ])
    .then((instances) => {
      return instances
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
  var log = logger.child({
    instance: instanceData,
    method: 'InstanceService.killInstance'
  })
  log.info('InstanceService.killInstance call')
  return Promise.try(function () {
    log.trace('check state')
    var instanceModel = new Instance(instanceData)
    // If the instance is stopping its already on it's way to death
    // If the instance is starting we will have a race condition if we kill it right now
    // instead we need to wait for it to start, then the
    // start worker will kill based on conditions
    return Instance.assertNotStartingOrStopping(instanceModel)
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
        instanceId: instance._id.toString()
      })
    })
}

/**
 * Fetch instances by container id (build or application) and assert session
 * user has permission to view it
 *
 * @param    {String}           containerId            - Id for docker container (build or application)
 * @param    {Object}           sessionUser            -
 * @returns  {Promise}                                 - After the validation is finished
 * @resolves {Object}           res                    -
 * @resolves {Object}           res.instance           - Instance
 * @resolves {Boolean}          res.isCurrentContainer - Whether container is currently  running
 * @throws   {Boom.forbidden}                          - When the user does not have access to model
 * @throws   {Boom.notFound}                           - When no instance is found for given container
 */
InstanceService.fetchInstanceByContainerIdAndEnsureAccess = function (containerId, sessionUser) {
  const log = logger.child({
    method: 'fetchInstanceByContainerIdAndEnsureAccess',
    containerId,
    sessionUser
  })
  log.info('called')
  return Instance.findOneByContainerIdOrBuildContainerId(containerId)
    .then((instance) => {
      if (instance) {
        return { instance, isCurrentContainer: true }
      }
      log.trace('No instance found, fetching from history')
      // Instance not found, but perhaps we are looking for old logs!
      return clioClient.fetchContainerInstance(containerId)
        .then((instanceId) => {
          if (instanceId) {
            log.trace({ instanceId }, 'Found instanceId in history, fetching from database')
            return Promise.props({ instance: Instance.findByIdAsync(instanceId), isCurrentContainer: false })
          }
        })
    })
    .tap(res => {
      if (!res || !res.instance) {
        const err = new Instance.NotFoundError({ containerId })
        log.error({ err }, 'instance not found err')
        throw err
      }
    })
    .tap(res => {
      // IF they are requesting a build container for the shared github ID they have access. Since this
      // container ID is duplicated across multiple personal accounts we don't know if we got OUR personal account
      // container. But we do know that this build container logs should be allowed
      if (keypather.get(res.instance, 'contextVersion.build.dockerContainer') === containerId &&
        keypather.get(res.instance, 'contextVersion.owner.github') === process.env.SHARED_GITHUB_ID) {
        log.trace('Instance is allowed due to being a shared build')
        return true
      }
      log.trace('Ensuring model access')
      return PermissionService.ensureModelAccess(sessionUser, res.instance)
    })
}

/**
 * populate build, cv, and dependencies for responses
 * @param {Function} cb callback
 */
InstanceService.populateInstanceModels = function (instance) {
  const log = logger.child({
    instanceId: keypather.get(instance, '_id'),
    instanceName: keypather.get(instance, 'name'),
    method: 'InstanceService.populateInstanceModels'
  })
  log.info('called')

  const container = this.container || {}
  const noInspectData = !container.inspect || container.inspect.error

  return Promise.try(() => {
    if (container.dockerContainer && noInspectData) {
      throw Boom.badRequest('instance missing inspect data')
    }
  })
  .then(() => {
    return Promise.all([
      instance.populateAsync('build'),
      instance.updateCv(),
      ClusterDataService.populateInstanceWithClusterInfo(instance)
    ])
    .then(() => {
      return instance.toJSON()
    })
  })
}

/**
 * Helper method to combine all of the Build and CV fetches for a group of instances all at once,
 * populate the instances with their build and cv, then update the instance in the db with the cv
 * model
 * @param instances Instances collection to populate
 * @param sessionUser session user model
 * @returns {Promise}
 */
InstanceService.populateModels = function (instances, sessionUser) {
  const log = logger.child({
    instances: (instances || []).map(function (instance) {
      return {
        instanceId: keypather.get(instance, '_id'),
        instanceName: keypather.get(instance, 'name'),
        ownerGitHubId: keypather.get(instance, 'owner.github')
      }
    }),
    sessionUser,
    method: 'InstanceService.populateModels'
  })
  log.info('called')
  const instancesByCvId = {}
  const instancesByBuildId = {}
  instances.forEach(function (instance) {
    const container = instance.container || {}
    const noInspectData = !container.inspect || container.inspect.error
    if (container.dockerContainer && noInspectData) {
      const err = new Error('instance missing inspect data' + instance._id)
      keypather.set(err, 'data.level', 'critical')
      error.log(err)
      log.error({
        err,
        instanceId: keypather.get(instance, '_id')
      }, 'Instance is missing inspect data')
    }
    if (!Array.isArray(instancesByCvId[instance.contextVersion._id])) {
      instancesByCvId[instance.contextVersion._id] = []
    }
    instancesByCvId[instance.contextVersion._id].push(instance)

    if (!Array.isArray(instancesByBuildId[instance.build])) {
      instancesByBuildId[instance.build] = []
    }
    instancesByBuildId[instance.build].push(instance)
  })
  return Promise.all([
    ClusterDataService.populateInstancesWithClusterInfo(instances),
    ContextVersion.findAsync({ _id: { $in: Object.keys(instancesByCvId) } }, {'build.log': 0})
      .each(function (cv) {
        instancesByCvId[cv._id].forEach(function (instance) {
          instance._doc.contextVersion = cv
        })
      }),
    Build.findAsync({ _id: { $in: Object.keys(instancesByBuildId) } })
      .each(function (build) {
        instancesByBuildId[build._id].forEach(function (instance) {
          instance._doc.build = build
        })
      })
  ])
    .then(function () {
      log.trace({ instances }, 'all instances populated')
      return instances.map(function (instance) {
        return instance.toJSON()
      })
    })
}
