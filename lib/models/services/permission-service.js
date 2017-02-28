/**
 * Check permissions
 * @module lib/models/services/permission-service
 */
'use strict'
var Boom = require('dat-middleware').Boom
var exists = require('101/exists')
var Promise = require('bluebird')
var keypather = require('keypather')()
var logger = require('logger')
var errors = require('errors')
const Warning = require('error-cat/errors/warning')
var userService = require('models/services/user-service')
var orgService = require('models/services/organization-service')

function PermissionService () {}

PermissionService.logger = logger.child({
  module: 'PermissionService'
})

module.exports = PermissionService

/**
 * Check that at least one check passes.
 * @resolves with `undefined`
 * @rejects with first failed check if all checks failed
 */
PermissionService.ensureChecks = function (checks) {
  var log = PermissionService.logger.child({
    checksCount: checks.length,
    method: 'ensureChecks'
  })
  log.info('called')
  return Promise.any(checks)
  .catch(Promise.AggregateError, function (err) {
    log.error({ err: err[0] }, 'ensureChecks: all permission checks failed')
    throw err[0]
  })
}

/**
 * Check that `sessionUser` has an access to the model by being owner or moderator.
 * Model assumes to have `owner.github` property on which check is performed.
 * `model.owner.github` is compared first with `sessionUser` github id and then with
 * ids of user orgs
 * @param {User} user object that creates settings
 * @resolves with `undefined` if `sessionUser` is moderator
 * @rejects with `access denied (!isOwner|!isModerator)` if `sessionUser` is not owner|moderator
 */
PermissionService.ensureOwnerOrModerator = function (sessionUser, model) {
  var log = PermissionService.logger.child({
    sessionUser: sessionUser,
    method: 'ensureOwnerOrModerator'
  })
  log.info('called')
  return PermissionService.ensureChecks([
    PermissionService.isOwnerOf(sessionUser, model),
    PermissionService.isModerator(sessionUser)
  ])
  .return(model)
}

/**
 * Check that `sessionUser` has an access to the model by being owner or moderator or
 * `HelloRunnable` user
 * Model assumes to have `owner.github` property on which check is performed.
 * `model.owner.github` is compared first with `sessionUser` github id and then with
 * ids of user orgs
 * @param {User} user object that creates settings
 * @resolves with `undefined` if `sessionUser` is moderator
 * @rejects with `access denied (!isOwner|!isModerator)` if `sessionUser` is not owner|moderator
 */
PermissionService.ensureModelAccess = function (sessionUser, model) {
  var log = PermissionService.logger.child({
    sessionUser: sessionUser,
    method: 'ensureModelAccess'
  })
  log.info('called')
  return PermissionService.ensureChecks([
    PermissionService.ensureOwnerOrModerator(sessionUser, model),
    PermissionService.isHelloRunnableOwnerOf(sessionUser, model)
  ])
  .return(model)
}

/**
 * Check that session user is moderator
 * Model assumes to have `owner.github` property on which check is performed.
 * `model.owner.github` is compared first with `sessionUser` github id and then with
 * ids of user orgs
 * @param {User} user object that creates settings
 * @resolves with `undefined` if `sessionUser` is moderator
 * @rejects with `access denied (!isModerator)` if `sessionUser` is not moderator
 */
PermissionService.isModerator = function (sessionUser) {
  var log = PermissionService.logger.child({
    sessionUser: sessionUser,
    method: 'isModerator'
  })
  log.info('called')
  return Promise.try(function () {
    if (sessionUser.isModerator !== true) {
      throw Boom.forbidden('access denied (!isModerator)', { sessionUser: sessionUser })
    }
  })
}

/**
 * Check that model owner is `HelloRunnable` or current user is `HelloRunnable`
 * Model assumes to have `owner.github` property on which check is performed.
 * `model.owner.github` is compared first with `HelloRunnable` github id and
 * then `sessionUser` github id compared with `HelloRunnable`
 * @param {User} user object that creates settings
 * @param {model} any Runnable mongo model (Instance, CV, Settings etc)
 * @returns {Promise}
 * @resolves with `undefined` if `HelloRunnable` is an owner of the `model`
 * @rejects with `Access denied (!owner)` if `sessionUser` is not an owner of the `model`
 */
PermissionService.isHelloRunnableOwnerOf = function (sessionUser, model) {
  var modelGithubId = keypather.get(model, 'owner.github')
  var userGithubId = keypather.get(sessionUser, 'accounts.github.id')
  var log = PermissionService.logger.child({
    modelGithubId: modelGithubId,
    userGithubId: userGithubId,
    method: 'isHelloRunnableOwnerOf'
  })
  log.info('called')
  return Promise.try(function () {
    if (modelGithubId === process.env.HELLO_RUNNABLE_GITHUB_ID ||
      userGithubId === process.env.HELLO_RUNNABLE_GITHUB_ID ||
      modelGithubId === process.env.SHARED_GITHUB_ID) {
      return
    } else {
      throw Boom.forbidden('Access denied (!owner)', { githubId: modelGithubId })
    }
  })
}

/**
 * Determine if the contextVersion owner is the right user or a global user
 * user for demos
 *
 * @param {Number} ownerGithubId
 * @param {Object} contextVersion
 * @return {Boolean} contextVersion
 */
PermissionService.isContextVersionOwner = function (ownerGithubId, contextVersion) {
  const contextVersionOwner = keypather.get(contextVersion, 'owner.github')
  return contextVersionOwner !== ownerGithubId && contextVersionOwner !== process.env.SHARED_GITHUB_ID
}

/**
 * Check that session user has access to the model
 * Model assumes to have `owner.github` property on which check is performed.
 * `model.owner.github` is compared first with `sessionUser` github id and then with
 * ids of user orgs
 * @param {User} sessionUser object that creates settings
 * @param {model} model Runnable mongo model (Instance, CV, Settings etc)
 * @returns {Promise}
 * @resolves with `undefined` if `sessionUser` is an owner of the `model`
 * @rejects with `Access denied (!owner)` if `sessionUser` is not an owner of the `model`
 */
PermissionService.isOwnerOf = function (sessionUser, model) {
  var modelGithubId = keypather.get(model, 'owner.github')
  var userGithubId = keypather.get(sessionUser, 'accounts.github.id')
  var log = PermissionService.logger.child({
    modelGithubId: modelGithubId,
    userGithubId: userGithubId,
    method: 'isOwnerOf'
  })
  log.info('called')
  if (userGithubId === modelGithubId) {
    return Promise.resolve()
  }
  if (userGithubId === process.env.HELLO_RUNNABLE_GITHUB_ID) {
    return Promise.reject(new Warning('HelloRunnable should always fail org owner checks'))
  }
  return userService.getByGithubId(userGithubId)
    .then(function (user) {
      if (!userService.isUserPartOfOrgByGithubId(user, modelGithubId)) {
        // If the org isn't in the list of orgs from BigPoppa,
        // we need to attempt to add the user to it.
        return orgService.getByGithubId(modelGithubId)
          .then(function (org) {
            return orgService.addUser(org, user)
          })
      }
    })
    .catch(function (err) {
      throw Boom.forbidden('Access denied (!owner)', { err: err, githubId: modelGithubId })
    })
}

/**
 * Determines if the owner of a Model(ContextVersion|Instance) is currently allowed by the
 * user whitelist.
 * @param {ContextVersion} contextVersion The context version to check.
 * @return {Promise} Resolves if the owner of the model is currently
 *   allowed according to the user whitelist. Rejects if the user is not allowed
 *   or the model is malformed.
 */
PermissionService.checkOwnerAllowed = function (model) {
  var log = PermissionService.logger.child({
    model: model,
    method: 'checkOwnerAllowed'
  })
  log.info('called')
  return Promise.try(function () {
    var orgId = keypather.get(model, 'owner.github')
    if (!exists(orgId)) {
      throw new Error('Model does not have an owner github id.', {
        id: model._id
      })
    }
    // Allow creating containers/builds in shared host
    if (orgId === process.env.SHARED_GITHUB_ID) {
      return
    }
    return orgService.getByGithubId(orgId)
      .get('allowed')
      .then(function (allowed) {
        if (!allowed) {
          var orgNotAllowedErr = new errors.OrganizationNotAllowedError('Organization is not allowed')
          orgNotAllowedErr.data = { orgId: orgId }
          log.error(orgNotAllowedErr, 'Organization is not allowed')
          throw orgNotAllowedErr
        }
      })
  })
}
