/**
 * @module lib/routes/auth/github
 */
'use strict'
var express = require('express')
var middlewarize = require('middlewarize')
var mw = require('dat-middleware')

var logger = require('logger')
var passport = require('middlewares/passport')
var reqUtils = require('req-utils')
var token = middlewarize(require('models/auth/token-auth'))
var validateAuthRedirect = require('middlewares/validate-auth-redirect')

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
        logger.trace({
          authCallbackRedirect: req.session.authCallbackRedirect
        }, 'default authCallbackRedirect')
        next()
      }),
  // sets token to current users cookie and redirects back to requester
  mw.query('requiresToken').require()
    .then(
      mw.req().set('session.requiresToken', 'query.requiresToken')
    ),
  passport.authenticate('github'),
  function (req, res, next) {
    console.log('hye')
    next()
  })

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
  // if enforcing the whitelist, make sure the requested username is the same as sesionUser,
  // or that it is the name of an org to which the user belongs
  token.populateSharedSessionData('orgIds', 'userId', 'session', 'headers.cookie', 'cb'),
  function (req, res) {
    logger.trace({
      authCallbackRedirect: req.session.authCallbackRedirect
    }, 'authCallbackRedirect')
    res.redirect(req.session.authCallbackRedirect)
    delete req.session.authCallbackRedirect
  })

app.post('/auth/github/token',
  mw.body('accessToken').require(),
  passport.authenticate('github-token'),
  mw.res.send(200))
