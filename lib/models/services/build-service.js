/**
 * Create context versions to build, create and build builds
 * @module lib/models/services/build-service
 */
'use strict'
var assign = require('101/assign')
var Boom = require('dat-middleware').Boom
var isObject = require('101/is-object')
var joi = require('utils/joi')
var keypather = require('keypather')()
var logger = require('logger')
var pick = require('101/pick')
var pluck = require('101/pluck')
var Promise = require('bluebird')

var Build = require('models/mongo/build')
var Context = require('models/mongo/context')
var ContextService = require('models/services/context-service')
var ContextVersion = require('models/mongo/context-version')
var Instance = require('models/mongo/instance')
var PermissionService = require('models/services/permission-service')
var User = require('models/mongo/user')
var utils = require('middlewares/utils')

function BuildService () {}

BuildService.logger = logger.child({
  module: 'BuildService'
})

module.exports = BuildService

/**
 * Validates the options given to any of the RESTful Build Services
 *
 * @param    {Schema} schema - JOI validation model
 * @param    {Object} opts   - Options to be set on the build
 *
 * @returns  {Promise}         After the validation is finished
 * @resolves {null}
 * @throws   {Boom.badRequest} When the opts fail the validation check
 */
BuildService.validateOpts = function (schema, opts) {
  var schemaObject = joi.object(schema)
    .required()
    .label('Build opts validate')

  return joi.validateOrBoomAsync(opts, schemaObject)
}

BuildService.CREATE_SCHEMA = {
  contextVersions: joi.array().min(1).max(1).items(joi.objectId()),
  owner: joi.object({
    github: joi.alternatives().try(joi.number(), joi.string()).required()
  }).required(),
  createdBy: joi.object({
    github: joi.alternatives().try(joi.number(), joi.string()).required()
  }).required()
}

/**
 * Given a opts object full of parameters, create an build.  Once created, resolve with this new build
 *
 * @param    {Object}   opts                        - opts object from the route
 * @param    {String}   opts.contextVersion         - single contextVersion id to attach to this new
 *                                                      build
 * @param    {[String]} opts.contextVersions        - (for backwards compatibility) Array containing
 *                                                      one single contextVersion id
 * @param    {Object}   opts.owner                  - owner of this instance
 * @param    {Number}   opts.owner.github           - github id of the owner of this instance
 * @param    {User}     sessionUser                 - the session user User model
 *
 * @returns  {Promise}                When the Build has been created
 * @resolves {Build}                  Newly created Build
 * @throws   {Boom.notFound}          When any of the mongo queries fails to return a value
 * @throws   {Boom.badRequest}        When the contextVersion hasn't started building
 * @throws   {Boom.badRequest}        When the contextVersion owner doesn't match the opts.owner
 * @throws   {Boom.badImplementation} When the shortHash fails to generate
 * @throws   {Error}                  Any other error
 */
BuildService.createBuild = function (opts, sessionUser) {
  opts = {
    contextVersions: (opts.contextVersion) ? [opts.contextVersion] : opts.contextVersions,
    owner: opts.owner,
    createdBy: {
      github: keypather.get(sessionUser, 'accounts.github.id')
    }
  }
  var log = BuildService.logger.child({
    sessionUser: sessionUser,
    opts: opts,
    method: 'BuildService.createBuild'
  })
  log.info('BuildService.createBuild called')
  return BuildService.validateOpts(BuildService.CREATE_SCHEMA, opts)
    .tap(function () {
      return PermissionService.isOwnerOf(sessionUser, opts)
    })
    .then(function () {
      if (!keypather.get(opts, 'contextVersions.length')) {
        return
      }
      return ContextVersion.findByIdAsync(opts.contextVersions[0])
        .tap(function addContextIdToOpts (contextVersion) {
          if (!contextVersion) {
            throw Boom.notFound('contextVersion not found', {
              cvId: opts.contextVersions[0]
            })
          }
          // validate owners are the same
          if (keypather.get(contextVersion, 'owner.github') !== opts.owner.github) {
            throw Boom.badRequest('Context version\'s owner must match build owner', {
              cvOwner: keypather.get(contextVersion, 'owner.github'),
              buildOwner: opts.owner.github
            })
          }
          assign(opts, {
            contextVersions: [contextVersion._id],
            contexts: [contextVersion.context]
          })
        })
    })
    .then(function () {
      return Build.createAsync(opts)
    })
    .then(function (build) {
      return build.saveAsync()
    })
    .tap(function (build) {
      log.trace({
        build: keypather.get(build, '_id')
      }, 'Build created Successfully')
    })
}

/**
 * Find a build and throw an error if build was not found
 *
 * @param  {String} buildId - internal build id
 *
 * @throws {Boom.badRequest} When build id is invalid
 * @throws {Boom.notFound}   When build lookup failed
 * @throws {Error}           When Mongo fails
 */
BuildService.findBuild = function (id) {
  var log = BuildService.logger.child({
    method: 'findBuild',
    id: id
  })
  log.info('findBuild: call')
  return Promise.try(function () {
    if (!utils.isObjectId(id)) {
      log.error('findBuild: Build id is not valid')
      throw Boom.badRequest('Invalid build id', { id: id })
    }
  })
    .then(function () {
      return Build.findByIdAsync(id)
        .tap(function checkBuild (build) {
          if (!build) {
            log.error('findBuild: Build was not found')
            throw Boom.notFound('Build not found', { id: id })
          }
        })
    })
}

/**
 * Find a build and throw an error if build was not found or access denied
 * @param {String} id internal build id
 * @param {Object} sessionUser mongo model representing session user
 * @resolves with found Build model
 * @throws   {Boom.accessDenied}   When build lookup failed
 * @throws   {Error}               When Mongo fails
 */

BuildService.findBuildAndAssertAccess = function (id, sessionUser) {
  var log = BuildService.logger.child({
    method: 'findBuildAndAssertAccess',
    id: id,
    sessionUser: sessionUser
  })
  log.info('findBuildAndAssertAccess: call')
  return BuildService.findBuild(id)
    .tap(function (build) {
      return PermissionService.ensureModelAccess(sessionUser, build)
    })
}

/**
 * Try to build a build
 * @param {String} buildId internal build id
 * @param {Object} data build data
 * @param {String} data.message build message
 * @param {Object} data.triggeredAction action that caused the build
 * @param {Boolean} data.noCache true if this build should skip deduping
 * @param {Object} sessionUser mongo model representing session user
 * @resolves {Promise} updated Build model
 */
BuildService.buildBuild = function (buildId, data, sessionUser) {
  var log = BuildService.logger.child({
    method: 'buildBuild',
    buildId: buildId,
    data: pick(data, ['triggeredAction']),
    sessionUser: sessionUser
  })
  log.info('buildBuild: call')
  return BuildService.findBuildAndAssertAccess(buildId, sessionUser)
    .tap(function checkBuild (build) {
      if (build.completed) {
        throw Boom.conflict('Build is already built')
      }
      if (build.started) {
        throw Boom.conflict('Build is already in progress')
      }
      var triggeredAction = data.triggeredAction
      if (triggeredAction) {
        if (!triggeredAction.rebuild && !triggeredAction.appCodeVersion) {
          data.triggeredAction.manual = true
        }
      } else {
        data.triggeredAction = {
          manual: true
        }
      }
    })
    .then(function (build) {
      if (build.contextVersions.length === 0) {
        log.error('Cannot build a build without context versions')
        throw Boom.badRequest('Cannot build a build without context versions')
      }
      if (build.contextVersions.length > 1) { // this should not be possible.
        log.error('buildBuild: Cannot build a build with many context versions')
        throw Boom.badRequest('Cannot build a build with many context versions')
      }
      return ContextVersion.findByIdAsync(build.contextVersions[0])
        .tap(function (contextVersion) {
          if (!contextVersion) {
            log.error('Cannot build a build without context versions')
            throw Boom.badRequest('Cannot build a build without context versions')
          }
        })
        .tap(function setBuildInProgress () {
          log.info('buildBuild: setBuildInProgress')
          // must be set before dedupe
          return build.setInProgressAsync(sessionUser)
        })
        .then(function buildContextVersion (contextVersion) {
          log.info({ contextVersion: contextVersion }, 'buildBuild: buildContextVersion')
          if (contextVersion.build.started) {
            return contextVersion
          }
          return ContextVersion.buildSelf(contextVersion, sessionUser, data)
            .tap(function (newContexVersion) {
              log.info({ contextVersion: newContexVersion }, 'buildBuild: build context version self')
              return build.replaceContextVersionAsync(contextVersion, newContexVersion)
            })
            .catch(function (err) {
              log.error({ err: err }, 'buildBuild: error building cv')
              return build.modifyErroredAsync(contextVersion._id)
                .catch(function (err) {
                  log.error({ err: err }, 'buildBuild: error modifying build')
                })
                .return(contextVersion)
            })
        })
        .then(function updateBuild (contextVersion) {
          log.info({ contextVersion: contextVersion }, 'buildBuild: updateBuild')
          return build.modifyCompletedIfFinishedAsync(contextVersion.build)
        })
        .then(function refetchBuild () {
          log.info('buildBuild: refetchBuild')
          return Build.findByIdAsync(build._id)
        })
    })
}

/**
 * @param  {String}  buildId
 * @return {Promise}
 */
BuildService.updateSuccessfulBuild = (buildId) => {
  var log = logger.child({ method: 'updateSuccessfulBuild' })
  log.info({ buildId }, 'updateSuccessfulBuild called')

  return ContextVersion.updateAndGetSuccessfulBuild(buildId)
    .tap((SuccessfullContextVersions) => {
      var contextVersionIds = SuccessfullContextVersions.map(pluck('_id'))

      return Promise.all([
        Build.updateCompletedByContextVersionIdsAsync(contextVersionIds),
        BuildService._refreshContextVersionOnInstances(contextVersionIds)
      ])
    })
}

/**
 * @param  {String}  buildId
 * @param  {String}  errorMessage defined if runnable error
 * @return {Promise}
 */
BuildService.updateFailedBuild = (buildId, errorMessage) => {
  var log = logger.child({ method: 'updateFailedBuild' })
  log.info({ buildId }, 'updateFailedBuild called')

  return ContextVersion.updateAndGetFailedBuild(buildId, errorMessage)
    .tap((failedContextVersions) => {
      var contextVersionIds = failedContextVersions.map(pluck('_id'))

      return Promise.all([
        Build.updateFailedByContextVersionIdsAsync(contextVersionIds),
        BuildService._refreshContextVersionOnInstances(contextVersionIds)
      ])
    })
}

/**
 * @param  {String[]} contextVersionIds
 * @return {Promise}
 */
BuildService._refreshContextVersionOnInstances = (contextVersionIds) => {
  var log = logger.child({ method: '_refreshContextVersionOnInstances' })
  log.trace({ contextVersionIds }, '_refreshContextVersionOnInstances called')

  return Instance.findByContextVersionIdsAsync(contextVersionIds)
    .each((instanceModel) => { return instanceModel.updateCv() })
}

/**
 * Helper function to validate pushInfo in various places. Throws an error if
 * any problem is found.
 * @private
 * @param {Object} pushInfo GitHub push information.
 * @param {String} pushInfo.repo GitHub Repository.
 * @param {String} pushInfo.branch GitHub Branch.
 * @param {String} pushInfo.commit GitHub Commit.
 * @param {String} pushInfo.commitLog GitHub Commit Log
 * @param {Object} pushInfo.user GitHub User object.
 * @param {Number} pushInfo.user.id GitHub User ID.
 * @param [String] funcName Function name to prepend errors.
 * @returns {Promise} Resolved when fields are validated.
 */
BuildService.validatePushInfo = function (pushInfo, funcName) {
  var log = BuildService.logger.child({
    method: 'validatePushInfo',
    pushInfo: pushInfo,
    funcName: funcName
  })
  log.info('validating push info')
  return Promise.try(function () {
    if (!isObject(pushInfo)) {
      throw new Error(funcName + ' requires pushInfo')
    }
    ;[ 'repo', 'branch', 'commit' ].forEach(function (key) {
      if (!pushInfo[key]) {
        throw new Error(funcName + ' requires pushInfo.' + key)
      }
    })
    if (!keypather.get(pushInfo, 'user.id')) {
      throw new Error(funcName + ' requires pushInfo to contain user.id')
    }
  })
    .catch(function (err) {
      log.error({ err: err }, 'validation failed')
      throw err
    })
}

/**
 * Helper function that creates new context version.
 * @param {Object} instance Instance object of which to fork.
 * @param {Object} instance.contextVersion Instance's Context Version.
 * @param {String} instance.contextVersion.context Instance's Context.
 * @param {Object} pushInfo GitHub push information.
 * @param {String} pushInfo.repo GitHub Repository.
 * @param {String} pushInfo.branch GitHub Branch.
 * @param {String} pushInfo.commit GitHub Commit.
 * @param {Object} pushInfo.user GitHub User object.
 * @param {Number} pushInfo.user.id GitHub User ID.
 * @returns {Promise} Resolved with new Context Version.
 */
BuildService.createNewContextVersion = function (instance, pushInfo) {
  var log = BuildService.logger.child({
    method: 'createNewContextVersion',
    instanceId: keypather.get(instance, '_id'),
    pushInfo: pushInfo
  })
  log.info('called')
  var contextVersion = keypather.get(instance, 'contextVersion')
  var contextId = keypather.get(contextVersion, 'context')
  var pushInfoGithubId = keypather.get(pushInfo, 'user.id')
  return Promise.try(function () {
    if (!instance) {
      throw new Error('createNewContextVersion requires an instance')
    }
    if (!contextVersion) {
      throw new Error('createNewContextVersion requires an instance.contextVersion')
    }
    if (!contextId) {
      throw new Error('createNewContextVersion requires an instance.contextVersion.context')
    }
    return BuildService.validatePushInfo(pushInfo, 'createNewContextVersion')
  })
    .then(function () {
      return Promise.fromCallback(
        Context.findOne.bind(Context, { _id: contextId })
      )
    })
    .then(function (context) {
      var contextOwnerGithubId = keypather.get(context, 'owner.github')
      if (!contextOwnerGithubId) {
        throw new Error('createNewContextVersion requires the context to have an owner')
      }
      return Promise.fromCallback(function (callback) {
        var user = {
          accounts: {
            github: {
              id: pushInfoGithubId
            }
          }
        }
        var opts = {
          owner: {
            github: contextOwnerGithubId
          }
        }
        ContextService.handleVersionDeepCopy(
          context,
          contextVersion,
          user,
          opts,
          callback
        )
      })
    })
    .then(function (newContextVersion) {
      return ContextVersion.modifyAppCodeVersionByRepoAsync(
        newContextVersion._id.toString(),
        pushInfo.repo,
        pushInfo.branch,
        pushInfo.commit
      )
    })
    .catch(function (err) {
      log.error({ err: err }, 'errored creating a new context version')
      throw err
    })
}

/**
 * Instance forking functionality. We do the following things:
 * 1 - Create a new Context Version
 * 2 - Create a new Build (and build it)
 * @param   {Object} instance            - Instance to Fork.
 * @param   {Object} pushInfo            - GitHub push information.
 * @param   {String} pushInfo.repo       - GitHub Repository.
 * @param   {String} pushInfo.branch     - GitHub Branch.
 * @param   {String} pushInfo.commit     - GitHub Commit.
 * @param   {Object} pushInfo.user       - GitHub User object.
 * @param   {Number} pushInfo.user.id    - GitHub User ID.
 * @param   {String} triggeredActionName - autodeploy, autolaunch, isolation
 *
 * @returns {Promise} Resolves with { build: build, user: user }
 */
BuildService.createAndBuildContextVersion = function (instance, pushInfo, triggeredActionName) {
  var log = BuildService.logger.child({
    method: 'createAndBuildContextVersion',
    instanceId: keypather.get(instance, '_id'),
    pushInfo: pushInfo
  })
  log.info('called')
  var instanceUserGithubId = keypather.get(instance, 'createdBy.github')
  var instanceOwnerGithubId = keypather.get(instance, 'owner.github')
  return Promise
    .try(function () {
      if (!instance) {
        throw new Error('Instance is required')
      }
      if (!instanceUserGithubId) {
        var error = new Error('instance.createdBy.github is required')
        error.data = instance._id
        throw error
      }
      return BuildService.validatePushInfo(pushInfo, 'createAndBuildContextVersion')
    })
    .then(function () {
      log.trace('fetch users')
      return Promise.props({
        // instanceUser is the owner of the instance.
        instanceUser: User.findByGithubIdAsync(instanceUserGithubId),
        // pushUser is the user who pushed to GitHub (if we have the user in
        // our database).
        pushUser: User.findByGithubIdAsync(pushInfo.user.id)
      })
    })
    .then(function (result) {
      log.trace('create new cv')
      var instanceUser = result.instanceUser
      var pushUser = result.pushUser
      // 1. create a new context version.
      return BuildService.createNewContextVersion(instance, pushInfo)
        .then(function (newContextVersion) {
          log.trace({
            cvId: newContextVersion._id.toString()
          }, 'new cv was created')
          // the instanceUser needs to create the build (it's someone who is
          // known to be in our system).
          var createPayload = {
            contextVersion: newContextVersion._id.toString(),
            owner: {
              github: instanceOwnerGithubId
            }
          }
          var activeUser = pushUser || instanceUser
          return BuildService.createBuild(createPayload, activeUser)
            .then(function (build) {
              var buildBuildPayload = {
                message: triggeredActionName,
                triggeredAction: {
                  manual: false,
                  appCodeVersion: pick(pushInfo, ['repo', 'branch', 'commit', 'commitLog'])
                }
              }
              return BuildService.buildBuild(build._id, buildBuildPayload, activeUser)
            })
            .then(function (build) {
              return {
                user: activeUser,
                build: build
              }
            })
        })
    })
}
