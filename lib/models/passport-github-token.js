'use strict'

var assign = require('101/assign')
var GitHub = require('models/apis/github')
var joi = require('joi')
var logger = require('middlewares/logger')(__filename)
var Strategy = require('passport-strategy')
var util = require('util')

var githubUserDataSchema = joi.object().keys({
  id: joi.number().required(),
  login: joi.string().required(),
  name: joi.any().required(), // Not everyone has a name in GH profile (string or null)
  html_url: joi.string().required(),
  avatar_url: joi.string().required()
}).label('githubUserData').unknown().required()

function GitHubTokenStrategy (options, verify) {
  if (typeof options === 'function') {
    verify = options
    options = undefined
  }
  options = options || {}

  Strategy.call(this)
  this.name = 'github-token'
  this._verify = verify
}

util.inherits(GitHubTokenStrategy, Strategy)

GitHubTokenStrategy.prototype.authenticate = function (req, options) {
  options = options || {}
  var self = this

  var github = new GitHub({
    token: req.body.accessToken
  })
  github.getAuthorizedUser(function (err, githubUserData) {
    if (err) { return self.error(err) }
    var validation = joi.validate(githubUserData, githubUserDataSchema)
    if (validation.error !== null) {
      return self.error(validation.error)
    }
    var githubUser = validation.value
    // Compile data into a passport-github compatible format
    var profile = {
      id: githubUser.id,
      login: githubUser.login,
      displayName: githubUser.name || '',
      profileUrl: githubUser.html_url,
      accessToken: req.body.accessToken,
      provider: 'github',
      photos: [{
        value: githubUser.avatar_url
      }],
      avatar_url: githubUser.avatar_url,
      _raw: JSON.stringify(githubUser),
      _json: githubUser
    }
    github.getUserEmails(githubUser.id, function (err, emails) {
      if (err) { return self.error(err) }
      profile.emails = emails.map(function (email) {
        return assign(email, {
          value: email.email
        })
      })
      logger.log.trace({ profile: profile }, 'githubUser to save profile')
      self._verify(req.body.accessToken, undefined, profile, function (err, user, info) {
        if (err) {
          self.error(err)
        } else if (!user) {
          self.fail(info)
        } else {
          self.success(user, info)
        }
      })
    })
  })
}

module.exports = GitHubTokenStrategy
