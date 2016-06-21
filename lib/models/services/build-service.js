/**
 * Create context versions to build, create and build builds
 * @module lib/models/services/build-service
 */
'use strict'

var assign = require('101/assign')
var Boom = require('dat-middleware').Boom
var Promise = require('bluebird')
var envIs = require('101/env-is')
var isObject = require('101/is-object')
var joi = require('utils/joi')
var keypather = require('keypather')()
var logger = require('logger')
var pick = require('101/pick')

var Build = require('models/mongo/build')
var Context = require('models/mongo/context')
var ContextService = require('models/services/context-service')
var ContextVersion = require('models/mongo/context-version')
var PermissionService = require('models/services/permission-service')
var Runnable = require('models/apis/runnable')
var User = require('models/mongo/user')

function BuildService () {}

BuildService.logger = logger.child({
  tx: true,
  module: 'BuildService'
})

module.exports = BuildService

/**
 * Validates the options given to any of the RESTful Build Services
 * @param    {Schema} schema - JOI validation model
 * @param    {Object} opts   - Options to be set onto an instace
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

/**
 * Used to validate incoming input when creating a build
 * @param opts
 * @returns {Promise}
 */
BuildService.validateCreateOpts = function (opts) {
  return BuildService.validateOpts({
    contextVersions: joi.array().items(joi.string()),
    owner: joi.object({
      github: joi.alternatives().try(joi.number(), joi.string())
    })
  }, opts)
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
  if (keypather.get(opts, 'contextVersion')) {
    opts.contextVersions = [opts.contextVersion]
  }
  var shittyShittyCode = false
  if (envIs('test') && !opts.owner) {
    // THIS IS ONLY BECAUSE OF TESTS
    shittyShittyCode =
    keypather.set(opts, 'owner.github', sessionUser.accounts.github.id)
  }
  opts = pick(opts, [
    'contextVersions',
    'owner'
  ])
  var log = BuildService.logger.child({
    sessionUser: sessionUser,
    opts: opts,
    method: 'BuildService.createBuild'
  })
  log.info('BuildService.createBuild called')
  return BuildService.validateCreateOpts(opts)
    .then(function () {
      return PermissionService.isOwnerOf(sessionUser, opts)
    })
    .then(function () {
      if (keypather.get(opts, 'contextVersions.length')) {
        return ContextVersion.findByIdAsync(opts.contextVersions[0])
          .tap(function addContextIdToOpts (contextVersion) {
            if (!contextVersion) {
              throw Boom.notFound('contextVersion not found')
            }
            // validate owners are the same
            if (!shittyShittyCode && contextVersion.owner.github !== opts.owner.github) {
              throw Boom.badRequest('Context version\'s owner must match build owner')
            }
            assign(opts, {
              contextVersions: [contextVersion._id],
              contexts: [contextVersion.context]
            })
            return PermissionService.isOwnerOf(sessionUser, contextVersion)
          })
      }
    })
    .then(function createBuild () {
      assign(opts, {
        createdBy: {
          github: keypather.get(sessionUser, 'accounts.github.id')
        }
      })
      return Build.createAsync(opts)
    })
    .tap(function (build) {
      log.trace({
        build: keypather.get(build, '_id')
      }, 'Build created Successfully')
    })
    .catch(function (err) {
      log.error({ err: err }, 'Build Creation Failed')
      throw err
    })
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
  var log = this.logger.child({
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
  var log = this.logger.child({
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
  return Promise.try(function () {
    if (!instance) {
      throw new Error('Instance is required')
    }
    if (!instanceUserGithubId) {
      throw new Error('instance.createdBy.github is required')
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
      var activeUser = pushUser || instanceUser
      // 1. create a new context version.
      return BuildService.createNewContextVersion(instance, pushInfo)
        .then(function (newContextVersion) {
          // the instanceUser needs to create the build (it's someone who is
          // known to be in our system).
          return BuildService.createBuild({
            contextVersion: newContextVersion._id.toString(),
            owner: {
              github: instanceOwnerGithubId
            }
          })
            .then(function (build) {
              var runnable = Runnable.createClient({}, activeUser)
              return Promise.fromCallback(function (callback) {
                log.trace('create and build a build')
                var buildBuildPayload = {
                  message: triggeredActionName,
                  triggeredAction: {
                    manual: false,
                    appCodeVersion: pick(pushInfo, ['repo', 'branch', 'commit', 'commitLog'])
                  }
                }
                runnable.buildBuild(build, {json: buildBuildPayload}, callback)
              })
            })
            .then(function (build) {
              return {
                user: activeUser,
                build: build,
                contextVersion: newContextVersion
              }
            })
        })
    })
}
