'use strict'

var isString = require('101/is-string')
var keypather = require('keypather')()
var UserWhitelist = require('models/mongo/user-whitelist')

var ContextVersionService = module.exports = {}

/**
 * Determines if the owner of a context version is currently allowed by the
 * user whitelist.
 * @param {[type]} contextVersion The context version to check.
 * @return {Promise} Resolves if the owner of the context version is currently
 *   allowed according to the user whitelist. Rejects if the user is not allowed
 *   or the context version is malformed.
 */
ContextVersionService.checkOwnerAllowed = function (contextVersion) {
  return Promise
    .try(function () {
      var orgName = keypather.get(contextVersion, 'owner.username')
      if (!isString(orgName)) {
        throw Error('Context version does not have an org name.')
      }
      return UserWhitelist.findOneAsync({ lowerName: orgName.toLowerCase() })
        .then(function (whitelist) {
          if (!whitelist) {
            var orgNotFoundErr = new Error('Organization not found')
            orgNotFoundErr.data = { orgName: orgName }
            throw orgNotFoundErr
          }
          if (!keypather.get(whitelist, 'allowed')) {
            var orgNotAllowedErr = new Error('Organization is not allowed')
            orgNotAllowedErr.data = { orgName: orgName }
            throw orgNotAllowedErr
          }
        })
    })
}
