'use strict';

var passport = require('passport');
var GitHubStrategy = require('passport-github').Strategy;
var async = require('async');
var Boom = require('dat-middleware').Boom;
var find = require('101/find');
var hasProps = require('101/has-properties');
var config = require('configs');
var User = require('models/mongo/user');
var Github = require('models/apis/github');


// Example:
// https://github.com/jaredhanson/passport-github/blob/master/examples/login/app.js

var GITHUB_CLIENT_ID = config.GitHub.clientId;
var GITHUB_CLIENT_SECRET = config.GitHub.clientSecret;
var GITHUB_CALLBACK_URL = config.GitHub.callbackURL;
var GITHUB_SCOPE = config.GitHub.scope;

// Passport session setup.
//   To support persistent login sessions, Passport needs to be able to
//   serialize users into and deserialize users out of the session.  Typically,
//   this will be as simple as storing the user ID when serializing, and finding
//   the user by ID when deserializing.  However, since this example does not
//   have a database of user records, the complete GitHub profile is serialized
//   and deserialized.
passport.serializeUser(function(user, done) {
  done(null, user._id);
});

passport.deserializeUser(function(userId, done) {
  User.findById(userId, done);
});

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
  function(accessToken, refreshToken, profile, done) {
    async.waterfall([
      User.findByGithubId.bind(User, profile.id),
      getUserPrimaryEmail,
      updateOrCreateUser
    ], done);

    function getUserPrimaryEmail (user, cb) {
      var github = new Github({ token: accessToken });
      github.user.getEmails({
        user: profile.id
      }, function (err, emails) {
        if (err) { cb(err); }

        var primaryEmail = find(emails, hasProps({ primary: true }));
        if (!primaryEmail) {
          cb(Boom.badRequest(400, 'GitHub account is missing primary email'));
        }
        else if (!primaryEmail.verified) {
          cb(Boom.badRequest(400, 'GitHub primary email is not verified'));
        }
        else {
          cb(null, user, primaryEmail);
        }
      });
    }

    function updateOrCreateUser (user, primaryEmail, cb) {
      user = user || {};
      profile.accessToken = accessToken;
      profile.refreshToken = refreshToken;
      var update = {
        $set: {
          'username': user.username || profile.username,
          'email': user.email || primaryEmail,
          'accounts.github': profile,
          'permission_level': 1
        }
      };
      var opts = {
        upsert: true
      };
      async.waterfall([
        User.updateByGithubId.bind(User, profile.id, update, opts),
        function (docsUpdated, model, cb) {
          User.findByGithubId(profile.id, cb);
        }
      ], cb);
    }
  }
));

module.exports = passport;