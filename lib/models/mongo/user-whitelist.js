'use strict'

/** @module models/user-whitelist */

var GitHub = require('models/apis/github')
var keypather = require('keypather')()
var mongoose = require('mongoose')

var UserWhitelistSchema = require('models/mongo/schemas/user-whitelist')

/**
 * Find all whitelisted orgs that the user belongs to/is authorized to access
 *
 * @param {String} accessToken - A Github access token to get user orgs
 * @param {Function} cb
 */
UserWhitelistSchema.statics.getWhitelistedUsersForGithubUser = function (accessToken, cb) {
  var self = this
  if (!accessToken) {
    return cb(new Error('An access token must be provided'))
  }
  var github = new GitHub({ token: accessToken })
  github.getUserAuthorizedOrgs(function (err, orgs) {
    if (err) return cb(err)
    var githubOrgs = {}
    var userOrgNames = orgs.map(function (org) {
      var lowerCaseName = keypather.get(org, 'login.toLowerCase()')
      githubOrgs[lowerCaseName] = org
      return lowerCaseName
    })
    self.find({ lowerName: { $in: userOrgNames } }, function (err, whitelistedOrgsCollection) {
      if (err) return cb(err)
      var whitelistedOrgs = whitelistedOrgsCollection.map(function (model) {
        model._doc.org = githubOrgs[model.lowerName]
        return model
      })
      return cb(null, whitelistedOrgs)
    })
  })
}

module.exports = mongoose.model('UserWhitelist', UserWhitelistSchema)
