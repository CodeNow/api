/**
 * @module lib/routes/auth/github
 */
'use strict'

var express = require('express')
var mw = require('dat-middleware')
var Boom = require('dat-middleware').Boom
var flow = require('middleware-flow')
var middlewarize = require('middlewarize')
var pluck = require('101/pluck')
var reqUtils = require('req-utils')
var userWhitelist = require('mongooseware')(require('models/mongo/user-whitelist'))

var checkFound = require('middlewares/check-found')
var error = require('error')
var github = middlewarize(require('models/apis/github'))
var logger = require('middlewares/logger')(__filename)
var passport = require('middlewares/passport')
var token = middlewarize(require('models/auth/token-auth'))

var log = logger.log

function enforceAuthWhitelist () { return !!process.env.ENABLE_USER_WHITELIST }

var app = module.exports = express()

// GET /auth/github
//   Use passport.authenticate() as route middleware to authenticate the
//   request.  The first step in GitHub authentication will involve redirecting
//   the user to github.com.  After authorization, GitHubwill redirect the user
//   back to this application at /auth/github/callback
app.get('/auth/github',
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
  // if enforcing the whitelist, make sure the requested username is the same as sesionUser,
  // or that it is the name of an org to which the user belongs
  flow.syncIf(enforceAuthWhitelist).then(validateAgainstWhitelist()),
  token.createWithSessionId('orgIds', 'userId', 'session', 'headers.cookie', 'cb'),
  function (req, res) {
    log.trace({
      tx: true,
      authCallbackRedirect: req.session.authCallbackRedirect
    }, 'authCallbackRedirect')
    res.redirect(req.session.authCallbackRedirect)
    delete req.session.authCallbackRedirect
  })

function logoutWhitelistFalse (req, res) {
  var whitelistErr = Boom.forbidden('access denied (!whitelist)', {
    user: req.sessionUser.toJSON(),
    orgs: req.userOrgs
  })
  error.log(whitelistErr, req)
  req.logout()
  res.redirect(302, reqUtils.getProtocol(req) + process.env.DOMAIN + '?whitelist=false')
  delete req.session.authCallbackRedirect
}

app.post('/auth/github/token',
  mw.body('accessToken').require(),
  passport.authenticate('github-token'),
  flow.syncIf(enforceAuthWhitelist).then(validateAgainstWhitelist()),
  mw.res.send(200))

function validateAgainstWhitelist () {
  return flow.series(
    // use github to get the orgs the user belongs to
    github.new({ token: 'sessionUser.accounts.github.accessToken' }),
    github.instance.getUserAuthorizedOrgs('cb').async('userOrgs'),
    function (req, res, next) {
      req.orgIds = req.userOrgs.map(pluck('id'))
      req.orgIds.push(req.sessionUser.accounts.github.id)
      req.userId = req.sessionUser.accounts.github.id
      next()
    },
    // filter out just the names, and add the username
    mw.req('userOrgs').mapValues(function (o, index, array, req) {
      o = o.map(pluck('login.toLowerCase()'))
      o.push(req.sessionUser.accounts.github.username.toLowerCase())
      return o
    }),
    // see if any of the orgs or the user are in the whitelist
    userWhitelist.findOne({
      lowerName: { $in: 'userOrgs' },
      allowed: true
    }),
    // if the user isn't in the whitelist, logout and redirect
    flow.mwIf(checkFound('userwhitelist')).else(logoutWhitelistFalse))
}
