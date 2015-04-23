'use strict';

var debug = require('debug')('runnable-api:routes:auth:github');
var express = require('express');
var mw = require('dat-middleware');
var querystring = require('querystring');
var url = require('url');

var error = require('error');
var passport = require('middlewares/passport');
var RedisToken = require('models/redis/token');
var reqUtils = require('req-utils');
var flow = require('middleware-flow');
var validations = require('middlewares/validations');
var equals = validations.equals;
var equalsKeypath = validations.equalsKeypath;
var checkFound = require('middlewares/check-found');
function enforceAuthWhitelist () { return !!process.env.ENABLE_USER_WHITELIST; }
var hasKeypaths = require('101/has-keypaths');

var userWhitelist = require('mongooseware')(require('models/mongo/user-whitelist'));
var github = require('middlewarize')(require('models/apis/github'));

var app = module.exports = express();

// GET /auth/github
//   Use passport.authenticate() as route middleware to authenticate the
//   request.  The first step in GitHub authentication will involve redirecting
//   the user to github.com.  After authorization, GitHubwill redirect the user
//   back to this application at /auth/github/callback
app.get('/auth/github',
  mw.req().set('session.authCallbackRedirect', 'query.redirect'),
  // require username and save it if the whitelist is active
  flow.syncIf(enforceAuthWhitelist).then(
    mw.query('username').require().string(),
    mw.req().set('session.requestedUsername', 'query.username.toLowerCase()')
  ),
  function (req, res, next) {
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
  // if enforcing the whitelist, make sure the requested uesrname is the same as sesionUser,
  // or that it is the name of an org to which the user belongs
  flow.syncIf(enforceAuthWhitelist).then(
    mw.req().set('user', 'sessionUser'),
    mw.req().set('lowerUsername', 'user.accounts.github.username.toLowerCase()'),
    mw.req('session.requestedUsername').validate(equalsKeypath('lowerUsername')).else(
      // look to see if the user has an org that matches the requested username
      github.new({ token: 'user.accounts.github.accessToken' }),
      github.instance.getUserAuthorizedOrgs('cb').async('userOrgs'),
      // look for the org with the matching username
      mw.req('userOrgs').mapValues(function (o, index, array, req) {
        return o.filter(hasKeypaths({ 'login.toLowerCase()': req.session.requestedUsername }));
      }),
      // check to see if we've found an org
      mw.req('userOrgs.length').validate(equals(1))
        .else(logoutWhitelistFalse)
    ), // !validate (requested username !== user's username)
    userWhitelist.findOne({
      lowerName: 'session.requestedUsername',
      allowed: true
    }),
    // if the user isn't in the whitelist, logout and redirect
    flow.mwIf(checkFound('userwhitelist')).else(logoutWhitelistFalse)
  ), // !syncIf enforceAuthWhitelist
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
          // append querystring correctly
          var targetUrl = url.parse(session.authCallbackRedirect);
          var qs = querystring.parse(targetUrl.query);
          qs.token = token.getKey();
          targetUrl.search = querystring.stringify(qs);
          delete targetUrl.query;
          targetUrl = url.format(targetUrl);
          session.authCallbackRedirect = targetUrl;
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
  });

function logoutWhitelistFalse (req, res) {
  req.logout();
  res.redirect('http://' + process.env.DOMAIN + '?whitelist=false');
  delete req.session.authCallbackRedirect;
}

app.post('/auth/github/token',
  mw.body('accessToken').require(),
  passport.authenticate('github-token'),
  mw.res.send(200));
