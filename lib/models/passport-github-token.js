'use strict'

var Strategy = require('passport-strategy')
var util = require('util')
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
        self.success(user, info)
      }
    })
  })
}

module.exports = GitHubTokenStrategy
