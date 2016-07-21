'use strict'

var Boom = require('dat-middleware').Boom
var exists = require('101/exists')
var keypather = require('keypather')()
var Promise = require('bluebird')
var ContextVersion = require('models/mongo/context-version')
var OrganizationService = require('models/services/organization-service')
var errors = require('errors')
var logger = require('logger')

var ContextVersionService = module.exports = {}

ContextVersionService.logger = logger.child({
  tx: true,
  module: 'ContextVersionService'
})

/**
 * Find context version by `id`
 * @param {ObjectId} id - context version id
 * @returns {Promise}
 * @resolves {Object} context version mongo model
 * @throws   {Boom.notFound}   When context version lookup failed
 * @throws   {Error}           When Mongo fails
 */
ContextVersionService.findContextVersion = function (id) {
  var log = ContextVersionService.logger.child({
    id: id,
    method: 'findContextVersion'
  })
  log.info('findContextVersion call')
  return ContextVersion.findByIdAsync(id)
    .tap(function (contextVersion) {
      if (!contextVersion) {
        log.error('Context Version not found')
        throw Boom.notFound('Context Version not found', { id: id })
      }
    })
}

/**
 * Determines if the owner of a context version is currently allowed by the
 * user whitelist.
 * @param {ContextVersion} contextVersion The context version to check.
 * @return {Promise} Resolves if the owner of the context version is currently
 *   allowed according to the user whitelist. Rejects if the user is not allowed
 *   or the context version is malformed.
 */
ContextVersionService.checkOwnerAllowed = function (contextVersion) {
  var log = ContextVersionService.logger.child({
    contextVersion: contextVersion,
    method: 'checkOwnerAllowed'
  })
  log.info('checkOwnerAllowed call')
  return Promise.try(function () {
    var orgGithubId = keypather.get(contextVersion, 'owner.github')
    if (!exists(orgGithubId)) {
      throw new Error('Context version does not have an owner github id.', {
        cvId: contextVersion._id
      })
    }
    return OrganizationService.getByGithubId(orgGithubId)
      .then(function (org) {
        if (!org) {
          var orgNotFoundErr = new errors.OrganizationNotFoundError('Organization not found')
          orgNotFoundErr.data = { orgGithubId: orgGithubId }
          throw orgNotFoundErr
        }
        if (!keypather.get(org, 'allowed')) {
          var orgNotAllowedErr = new errors.OrganizationNotAllowedError('Organization is not allowed. Trial or actived period have expired.')
          orgNotAllowedErr.data = { orgGithubId: orgGithubId }
          throw orgNotAllowedErr
        }
      })
  })
}
