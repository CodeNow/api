'use strict'

var assign = require('101/assign')
var GitHub = require('models/apis/github')
var keypather = require('keypather')()
var logger = require('middlewares/logger')(__filename)
var Strategy = require('passport-strategy')
var util = require('util')

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

  var gh = new GitHub({
    token: req.body.accessToken
  })
  gh.user.get({}, function (err, githubUser) {
    if (err) { return self.error(err) }
    // Delete unnecessary values
    keypather.del(githubUser, 'meta')
    keypather.del(githubUser, 'plan')
    // Compile data into a passport-github compatible format
    var profile = {
      id: githubUser.id,
      username: githubUser.username,
      login: githubUser.login,
      displayName: githubUser.name,
      profileUrl: githubUser.html_url,
      accessToken: req.body.accessToken,
      provider: 'github',
      photos: [{
        value: githubUser.avatar_url
      }],
      _raw: JSON.stringify(githubUser),
      _json: githubUser
    }
    gh.user.getEmails({
      user: githubUser.id
    }, function (err, emails) {
      if (err) { return (err) }
      githubUser.emails = emails.map(function (emailObject) {
        return assign({
          value: emailObject.email
        })
      })
      logger.log.trace({ profile: profile }, 'githubUser to save profile')
      self._verify(req.body.accessToken, undefined, githubUser, function (err, user, info) {
        if (err) {
          self.error(err)
        } else if (!user) {
          self.fail(info)
        } else {
          self.success(user, profile)
        }
      })
    })
  })
}

module.exports = GitHubTokenStrategy
