'use strict'

var Boom = require('dat-middleware').Boom
var exists = require('101/exists')
var keypather = require('keypather')()
var Promise = require('bluebird')
var ContextVersion = require('models/mongo/context-version')
var UserWhitelist = require('models/mongo/user-whitelist')
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
    method: 'ContextVersionService.findContextVersion'
  })
  log.info('call')
  return ContextVersion.findByIdAsync(id)
    .tap(function (context) {
      if (!context) {
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
    method: 'ContextVersionService.checkOwnerAllowed'
  })
  log.info('call')
  return Promise.try(function () {
    var orgId = keypather.get(contextVersion, 'owner.github')
    if (!exists(orgId)) {
      throw new Error('Context version does not have an owner github id.', {
        cvId: contextVersion._id
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
