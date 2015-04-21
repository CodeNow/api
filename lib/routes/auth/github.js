'use strict';

var debug = require('debug')('runnable-api:routes:auth:github');
var express = require('express');
var mw = require('dat-middleware');

var error = require('error');
var passport = require('middlewares/passport');
var RedisToken = require('models/redis/token');
var reqUtils = require('req-utils');

var app = module.exports = express();

// GET /auth/github
//   Use passport.authenticate() as route middleware to authenticate the
//   request.  The first step in GitHub authentication will involve redirecting
//   the user to github.com.  After authorization, GitHubwill redirect the user
//   back to this application at /auth/github/callback
app.get('/auth/github',
  function (req, res, next) {
    req.session.authCallbackRedirect = req.query.redirect;
    req.session.requiresToken = req.query.requiresToken;
    next();
  },
  passport.authenticate('github'));

// GET /auth/github/callback
//   Use passport.authenticate() as route middleware to authenticate the
//   request.  If authentication fails, the user will be redirected back to the
//   login page.  Otherwise, the primary route function function will be called,
//   which, in this example, will redirect the user to the home page. Tf
//   if a token is required, generate and add to query before redirecting
app.get('/auth/github/callback',
  passport.authenticate('github', {
    failureRedirect: '/'
  }),
  function (req, res, next) {
    var session = req.session;
    debug('callback:session', session);
    if (session.requiresToken) {
      var token = new RedisToken();
      return token.setValue(session.passport.user, function (err) {
        // if setting token failed do not send token
        if (err) {
          error.log(err);
        } else {
          session.authCallbackRedirect += '?token='+ token.getKey();
        }
        next();
      });
    }
    next();
  },
  function (req, res) {
    var domainUrl = reqUtils.getProtocol(req) + process.env.DOMAIN;
    debug('callback:domainUrl', domainUrl);
    res.redirect(req.session.authCallbackRedirect || domainUrl);
    delete req.session.authCallbackRedirect;
  }
);

app.post('/auth/github/token',
  mw.body('accessToken').require(),
  passport.authenticate('github-token'),
  mw.res.send(200));
