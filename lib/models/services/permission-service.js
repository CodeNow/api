/**
 * Check permissions
 * @module lib/models/services/permission-service
 */
'use strict'

var exists = require('101/exists')
var Promise = require('bluebird')
var keypather = require('keypather')()
var hasKeypaths = require('101/has-keypaths')
var Boom = require('dat-middleware').Boom
var logger = require('logger')
var Github = require('models/apis/github')
var UserWhitelist = require('models/mongo/user-whitelist')
var errors = require('errors')

function PermissionService () {}

PermissionService.logger = logger.child({
  tx: true,
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
    tx: true,
    checksCount: checks.length,
    method: 'ensureChecks'
  })
  log.info('ensureChecks: call')
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
    tx: true,
    sessionUser: sessionUser,
    method: 'ensureOwnerOrModerator'
  })
  log.info('ensureOwnerOrModerator: call')
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
    tx: true,
    sessionUser: sessionUser,
    method: 'ensureModelAccess'
  })
  log.info('ensureModelAccess: call')
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
    tx: true,
    sessionUser: sessionUser,
    method: 'isModerator'
  })
  log.info('isModerator: call')
  return Promise.try(function () {
    if (sessionUser.isModerator !== true) {
      log.error('isModerator: access denied')
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
    tx: true,
    modelGithubId: modelGithubId,
    userGithubId: userGithubId,
    method: 'isHelloRunnableOwnerOf'
  })
  log.info('isHelloRunnableOwnerOf: call')
  return Promise.try(function () {
    if (modelGithubId === process.env.HELLO_RUNNABLE_GITHUB_ID ||
      userGithubId === process.env.HELLO_RUNNABLE_GITHUB_ID) {
      return
    } else {
      log.error('isHelloRunnableOwnerOf: Access denied (!owner)')
      throw Boom.forbidden('Access denied (!owner)', { githubId: modelGithubId })
    }
  })
}

/**
 * Check that session user has access to the model
 * Model assumes to have `owner.github` property on which check is performed.
 * `model.owner.github` is compared first with `sessionUser` github id and then with
 * ids of user orgs
 * @param {User} user object that creates settings
 * @param {model} any Runnable mongo model (Instance, CV, Settings etc)
 * @returns {Promise}
 * @resolves with `undefined` if `sessionUser` is an owner of the `model`
 * @rejects with `Access denied (!owner)` if `sessionUser` is not an owner of the `model`
 */
PermissionService.isOwnerOf = function (sessionUser, model) {
  var modelGithubId = keypather.get(model, 'owner.github')
  var userGithubId = keypather.get(sessionUser, 'accounts.github.id')
  var log = PermissionService.logger.child({
    tx: true,
    modelGithubId: modelGithubId,
    userGithubId: userGithubId,
    method: 'isOwnerOf'
  })
  log.info('isOwnerOf: call')
  if (userGithubId === modelGithubId) {
    return Promise.resolve()
  }
  var token = keypather.get(sessionUser, 'accounts.github.accessToken')
  var github = new Github({ token: token })
  return Promise.fromCallback(function (cb) {
    github.getUserAuthorizedOrgs(function (err, orgs) {
      if (err) { return cb(err) }
      var isMember = orgs.some(hasKeypaths({
        'id.toString()': modelGithubId.toString()
      }))
      if (!isMember) {
        log.error('isOwnerOf: Access denied (!owner)')
        return cb(Boom.forbidden('Access denied (!owner)', { githubId: modelGithubId }))
      }
      return cb()
    })
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
  log.info('checkOwnerAllowed call')
  return Promise.try(function () {
    var orgId = keypather.get(model, 'owner.github')
    if (!exists(orgId)) {
      throw new Error('Model does not have an owner github id.', {
        id: model._id
      })
    }
    return UserWhitelist.findOneAsync({ githubId: orgId })
      .then(function (whitelist) {
        if (!whitelist) {
          var orgNotFoundErr = new errors.OrganizationNotFoundError('Organization not found')
          orgNotFoundErr.data = { orgId: orgId }
          throw orgNotFoundErr
        }
        if (!keypather.get(whitelist, 'allowed')) {
          var orgNotAllowedErr = new errors.OrganizationNotAllowedError('Organization is not allowed')
          orgNotAllowedErr.data = { orgId: orgId }
          throw orgNotAllowedErr
        }
      })
  })
}
