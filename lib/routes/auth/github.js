'use strict';

var passport = require('passport');
var GitHubStrategy = require('passport-github').Strategy;
var config = require('configs');

var express = require('express');
var app = module.exports = express();

app.use(passport.initialize());

// Example:
// https://github.com/jaredhanson/passport-github/blob/master/examples/login/app.js

var GITHUB_CLIENT_ID = config.GitHub.clientId;
var GITHUB_CLIENT_SECRET = config.GitHub.clientSecret;
var GITHUB_CALLBACK_URL = config.GitHub.callbackURL;

// Passport session setup.
//   To support persistent login sessions, Passport needs to be able to
//   serialize users into and deserialize users out of the session.  Typically,
//   this will be as simple as storing the user ID when serializing, and finding
//   the user by ID when deserializing.  However, since this example does not
//   have a database of user records, the complete GitHub profile is serialized
//   and deserialized.
/*
passport.serializeUser(function(user, done) {
  done(null, user);
});

passport.deserializeUser(function(obj, done) {
  done(null, obj);
});
*/

// Use the GitHubStrategy within Passport.
//   Strategies in Passport require a `verify` function, which accept
//   credentials (in this case, an accessToken, refreshToken, and GitHub
//   profile), and invoke a callback with a user object.
passport.use(new GitHubStrategy({
    clientID: GITHUB_CLIENT_ID,
    clientSecret: GITHUB_CLIENT_SECRET,
    callbackURL: GITHUB_CALLBACK_URL
  },
  function(accessToken, refreshToken, profile, done) {

    console.log('accessToken', accessToken);
    console.log('refreshToken', refreshToken);
    console.log('profile', profile);
    console.log('done', done);

    return done(null, profile);

  }
));

app.get('/dummy', function (req, res, next) {
  return res.json(200, {});
});

// GET /auth/github
//   Use passport.authenticate() as route middleware to authenticate the
//   request.  The first step in GitHub authentication will involve redirecting
//   the user to github.com.  After authorization, GitHubwill redirect the user
//   back to this application at /auth/github/callback
app.get('/github',
  passport.authenticate('github', {
    session: false //We don't want to use passport's session mechanism
  }),
  function(req, res){
    // The request will be redirected to GitHub for authentication, so this
    // function will not be called.
  });

// GET /auth/github/callback
//   Use passport.authenticate() as route middleware to authenticate the
//   request.  If authentication fails, the user will be redirected back to the
//   login page.  Otherwise, the primary route function function will be called,
//   which, in this example, will redirect the user to the home page.
app.get('/github/callback',
  function (req, res, next) {
    next();
  },
  passport.authenticate('github', {
    session: false,
    failureRedirect: '/'
  }),
  function(req, res) {
    res.redirect('/');
    // request({
    //   url:    config.api.default.protocol + '://' + config.api.default.host + '/users/me',
    //   method: 'PUT',
    //   headers: {
    //     'runnable-token': req.session.access_token
    //   },
    //   json: {
    //     username: 'dummy6',
    //     email:    'dummy6@gmail.com',
    //     password: 'dummy6'
    //   }
    // }, function (error, response, body) {
    //   console.log('body ', body);
    // });
  });
