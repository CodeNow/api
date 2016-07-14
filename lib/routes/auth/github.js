/**
 * @module lib/routes/auth/github
 */
'use strict'

var express = require('express')
var mw = require('dat-middleware')
var middlewarize = require('middlewarize')
var reqUtils = require('req-utils')
var github = middlewarize(require('models/apis/github'))
var logger = require('middlewares/logger')(__filename)
var passport = require('middlewares/passport')
var token = middlewarize(require('models/auth/token-auth'))
var validateAuthRedirect = require('middlewares/validate-auth-redirect')

var log = logger.log

var app = module.exports = express()

// GET /auth/github
//   Use passport.authenticate() as route middleware to authenticate the
//   request.  The first step in GitHub authentication will involve redirecting
//   the user to github.com.  After authorization, GitHubwill redirect the user
//   back to this application at /auth/github/callback
app.get('/auth/github',
  validateAuthRedirect,
  mw.query('redirect').require()
    .then(
      mw.req().set('session.authCallbackRedirect', 'query.redirect'))
    .else(
      function (req, res, next) {
        // default redirect url to domain
        req.session.authCallbackRedirect =
          reqUtils.getProtocol(req) + process.env.DOMAIN
        log.trace({
          tx: true,
          authCallbackRedirect: req.session.authCallbackRedirect
        }, 'default authCallbackRedirect')
        next()
      }),
  // sets token to current users cookie and redirects back to requester
  mw.query('requiresToken').require()
    .then(
      mw.req().set('session.requiresToken', 'query.requiresToken')
    ),
  passport.authenticate('github'))

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
  token.populateSharedSessionData('orgIds', 'userId', 'session', 'headers.cookie', 'cb'),
  function (req, res) {
    log.trace({
      tx: true,
      authCallbackRedirect: req.session.authCallbackRedirect
    }, 'authCallbackRedirect')
    res.redirect(req.session.authCallbackRedirect)
    delete req.session.authCallbackRedirect
  })

app.post('/auth/github/token',
  mw.body('accessToken').require(),
  passport.authenticate('github-token'),
  mw.res.send(200))

