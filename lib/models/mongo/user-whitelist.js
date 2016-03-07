'use strict'

/** @module models/user-whitelist */

var GitHub = require('models/apis/github')
var mongoose = require('mongoose')

var UserWhitelistSchema = require('models/mongo/schemas/user-whitelist')

UserWhitelistSchema.statics.getUserWhitelistedOrgs = function (accessToken, cb) {
  var self = this
  var github = new GitHub({ token: accessToken })
  github.getUserAuthorizedOrgs(function (err, orgs) {
    if (err) cb(err)
    var userOrgNames = orgs.map(function (org) {
      return org.login.toLowerCase()
    })
    self.find({ lowerName: { $in: userOrgNames } }, cb)
  })
}

module.exports = mongoose.model('UserWhitelist', UserWhitelistSchema)
