'use strict';

var express = require('express');
var mw = require('dat-middleware');
var debug = require('debug')('runnable-api:routes:auth:github');

var reqUtils = require('req-utils');
var passport = require('middlewares/passport');
var reqUtils = require('req-utils');
var flow = require('middleware-flow');
var checkFound = require('middlewares/check-found');
var pluck = require('101/pluck');
var middlewarize = require('middlewarize');
var token = middlewarize(require('models/auth/token-auth'));
function enforceAuthWhitelist () { return !!process.env.ENABLE_USER_WHITELIST; }
var userWhitelist = require('mongooseware')(require('models/mongo/user-whitelist'));
var github = require('middlewarize')(require('models/apis/github'));

var app = module.exports = express();

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
          reqUtils.getProtocol(req) + process.env.DOMAIN;
        debug('default authCallbackRedirect', req.session.authCallbackRedirect);
        next();
      }),
  // sets token to current users cookie and redirects back to requester
  mw.query('requiresToken').require().then(
    mw.req().set('session.requiresToken', 'query.requiresToken'),
    token.createWithSessionCookie('session', 'headers.cookie', 'cb'),
    function (req, res) {
      debug('redirecting', req.session.authCallbackRedirect);
      res.redirect(req.session.authCallbackRedirect);
      delete req.session.authCallbackRedirect;
    }),
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
  // if enforcing the whitelist, make sure the requested username is the same as sesionUser,
  // or that it is the name of an org to which the user belongs
  flow.syncIf(enforceAuthWhitelist).then(validateAgainstWhitelist()),
  function (req, res) {
    debug('authCallbackRedirect', req.session.authCallbackRedirect);
    res.redirect(req.session.authCallbackRedirect);
    delete req.session.authCallbackRedirect;
  });

function logoutWhitelistFalse (req, res) {
  req.logout();
  res.redirect(reqUtils.getProtocol(req) + process.env.DOMAIN + '?whitelist=false');
  delete req.session.authCallbackRedirect;
}

app.post('/auth/github/token',
  mw.body('accessToken').require(),
  passport.authenticate('github-token'),
  flow.syncIf(enforceAuthWhitelist).then(validateAgainstWhitelist()),
  mw.res.send(200));

function validateAgainstWhitelist () {
  return flow.series(
    // use github to get the orgs the user belongs to
    github.new({ token: 'sessionUser.accounts.github.accessToken' }),
    github.instance.getUserAuthorizedOrgs('cb').async('userOrgs'),
    // filter out just the names, and add the username
    mw.req('userOrgs').mapValues(function (o, index, array, req) {
      o = o.map(pluck('login.toLowerCase()'));
      o.push(req.sessionUser.accounts.github.username.toLowerCase());
      return o;
    }),
    // see if any of the orgs or the user are in the whitelist
    userWhitelist.findOne({
      lowerName: { $in: 'userOrgs' },
      allowed: true
    }),
    // if the user isn't in the whitelist, logout and redirect
    flow.mwIf(checkFound('userwhitelist')).else(logoutWhitelistFalse));
}
