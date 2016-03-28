'use strict'

var Strategy = require('passport-strategy')
var util = require('util')
var keypather = require('keypather')()
var GitHub = require('models/apis/github')

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
    self._verify(req.body.accessToken, undefined, githubUser, function (err, user, info) {
      if (err) {
        self.error(err)
      } else if (!user) {
        self.fail(info)
      } else {
        // Delete unnecessary values
        keypather.del(info, 'meta')
        keypather.del(info, 'plan')
        // Compile data into a passport-github compatible format
        var profile = {
          id: info.id,
          username: info.username,
          login: info.login,
          displayName: info.name,
          profileUrl: info.html_url,
          accessToken: req.body.accessToken,
          provider: 'github',
          photos: [{
            value: info.avatar_url
          }],
          _raw: JSON.stringify(info),
          _json: info
        }
        gh.user.getEmails({
          user: profile.id
        }, function (err, emails) {
          if (err) { return (err) }
          profile.emails = emails
          console.log('emails', emails)
          self.success(user, profile)
        })
      }
    })
  })
}

module.exports = GitHubTokenStrategy
