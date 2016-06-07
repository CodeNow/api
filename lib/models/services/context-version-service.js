'use strict'

var exists = require('101/exists')
var keypather = require('keypather')()
var Promise = require('bluebird')
var UserWhitelist = require('models/mongo/user-whitelist')
var errors = require('errors')

var ContextVersionService = module.exports = {}

/**
 * Determines if the owner of a context version is currently allowed by the
 * user whitelist.
 * @param {ContextVersion} contextVersion The context version to check.
 * @return {Promise} Resolves if the owner of the context version is currently
 *   allowed according to the user whitelist. Rejects if the user is not allowed
 *   or the context version is malformed.
 */
ContextVersionService.checkOwnerAllowed = function (contextVersion) {
  return Promise.try(function () {
    var orgId = keypather.get(contextVersion, 'owner.github')
    if (!exists(orgId)) {
      throw new Error('Context version does not have an owner github id.')
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
