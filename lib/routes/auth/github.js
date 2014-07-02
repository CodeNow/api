'use strict';

var express = require('express');
var passport = require('passport');
var configs = require('configs');
var app = module.exports = express();

// GET /auth/github
//   Use passport.authenticate() as route middleware to authenticate the
//   request.  The first step in GitHub authentication will involve redirecting
//   the user to github.com.  After authorization, GitHubwill redirect the user
//   back to this application at /auth/github/callback
// require('nock').recorder.rec();
app.get('/github',
  function (req, res, next) {
    req.session.authCallbackRedirect = req.query.redirect;
    next();
  },
  passport.authenticate('github'));

// GET /auth/github/callback
//   Use passport.authenticate() as route middleware to authenticate the
//   request.  If authentication fails, the user will be redirected back to the
//   login page.  Otherwise, the primary route function function will be called,
//   which, in this example, will redirect the user to the home page.
app.get('/github/callback',
  passport.authenticate('github', {
    failureRedirect: '/'
  }),
  function (req, res) {
    // FIXME: protocol hardcoded
    res.redirect(req.session.authCallbackRedirect || 'http://'+configs.domain);
    delete req.session.authCallbackRedirect;
  }
);
