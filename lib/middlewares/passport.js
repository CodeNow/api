/**
 * @module middlewares/passport
 */
'use strict'

var Boom = require('dat-middleware').Boom
var GitHubStrategy = require('passport-github').Strategy
var async = require('async')
var find = require('101/find')
var hasProps = require('101/has-properties')
var keypather = require('keypather')()
var passport = require('passport')

var GitHubTokenStrategy = require('models/passport-github-token')
var Github = require('models/apis/github')
var User = require('models/mongo/user')
var logger = require('middlewares/logger')(__filename)

// Example:
// https://github.com/jaredhanson/passport-github/blob/master/examples/login/app.js

var GITHUB_CALLBACK_URL = process.env.GITHUB_CALLBACK_URL
var GITHUB_CLIENT_ID = process.env.GITHUB_CLIENT_ID
var GITHUB_CLIENT_SECRET = process.env.GITHUB_CLIENT_SECRET
var GITHUB_SCOPE = process.env.GITHUB_SCOPE

// Passport session setup.
//   To support persistent login sessions, Passport needs to be able to
//   serialize users into and deserialize users out of the session.  Typically,
//   this will be as simple as storing the user ID when serializing, and finding
//   the user by ID when deserializing.  However, since this example does not
//   have a database of user records, the complete GitHub profile is serialized
//   and deserialized.
passport.serializeUser(function (user, done) {
  done(null, user._id)
})

passport.deserializeUser(function (userId, done) {
  User.findById(userId, done)
})

passport.use(new GitHubTokenStrategy({}, manageUser))

// Use the GitHubStrategy within Passport.
//   Strategies in Passport require a `verify` function, which accept
//   credentials (in this case, an accessToken, refreshToken, and GitHub
//   profile), and invoke a callback with a user object.
passport.use(new GitHubStrategy({
  clientID: GITHUB_CLIENT_ID,
  clientSecret: GITHUB_CLIENT_SECRET,
  callbackURL: GITHUB_CALLBACK_URL,
  scope: GITHUB_SCOPE
},
  manageUser
))

function manageUser (accessToken, refreshToken, profile, done) {
  profile.id = Number(profile.id)
  async.waterfall([
    User.findByGithubId.bind(User, profile.id),
    updateOrCreateUser
  ], done)

  function updateOrCreateUser (user, cb) {
    var primaryEmail = find(profile.emails, hasProps({ primary: true }))
    if (!primaryEmail) {
      return cb(Boom.badRequest('GitHub account is missing primary email'))
    } else if (!primaryEmail.verified) {
      return cb(Boom.badRequest('GitHub primary email is not verified'))
    }
    profile.accessToken = accessToken
    profile.refreshToken = refreshToken
    profile.username = profile.username || profile.login

    if (user && user._id) {
      logger.log.info({user: user}, 'existing user, updating...')
      // found existing user, updating
      user.email = primaryEmail.value
      user.accounts = {
        github: profile
      }
      user.gravatar = getGravatarUrl(profile)
      user.save(function (err) {
        if (err) {
          return cb(err)
        }
        User.findByGithubId(profile.id, cb)
      })
    } else {
      logger.log.info({user: user}, 'new user, inserting...')
      // fresh user, inserting
      var data = {
        'email': primaryEmail.value,
        'accounts': { 'github': profile },
        'gravatar': getGravatarUrl(profile),
        'permissionLevel': 1,
        'created': new Date()
      }
      User.create(data, function (err) {
        if (err) {
          return cb(err)
        }
        User.findByGithubId(profile.id, cb)
      })
    }
    function getGravatarUrl (ghProfile) {
      return keypather.get(ghProfile, '_json.avatar_url') || keypather.get(ghProfile, 'avatar_url')
    }
  }
}

module.exports = passport
