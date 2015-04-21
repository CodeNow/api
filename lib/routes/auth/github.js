'use strict';

var express = require('express');
var passport = require('middlewares/passport');
var app = module.exports = express();

var mw = require('dat-middleware');
var flow = require('middleware-flow');
var validations = require('middlewares/validations');
var equals = validations.equals;
var checkFound = require('middlewares/check-found');
function enforceAuthWhitelist () { return !!process.env.ENABLE_USER_WHITELIST; }

var keypather = require('keypather')();
function invoke () {
  var args = Array.prototype.slice.apply(arguments);
  var keypath = args.shift();
  return function (o) {
    var fn = keypather.get(o, keypath);
    return fn.apply(o, args);
  };
}
var compose = require('101/compose');
function valueEquals (key, val) {
  return compose(require('101/equals')(val), require('101/pluck')(val));
}

var userWhitelist = require('mongooseware')(require('models/mongo/user-whitelist'));
// var user = require('mongooseware')(require('models/mongo/user'));
var github = require('middlewarize')(require('models/apis/github'));

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
  passport.authenticate('github'));

// GET /auth/github/callback
//   Use passport.authenticate() as route middleware to authenticate the
//   request.  If authentication fails, the user will be redirected back to the
//   login page.  Otherwise, the primary route function function will be called,
//   which, in this example, will redirect the user to the home page.
app.get('/auth/github/callback',
  passport.authenticate('github', {
    failureRedirect: '/'
  }),
  // if enforcing the whitelist, make sure the requested uesrname is the same as sesionUser,
  // or that it is the name of an org to which the user belongs
  flow.syncIf(enforceAuthWhitelist).then(
    mw.req().set('user', 'sessionUser'),
    mw.req('session.requestedUsername').validate(equals('user.username.toLowerCase()')).else(
      // look to see if the user has an org that matches the requested username
      github.create({ token: 'user.accessToken' }),
      github.getUserAuthorizedOrgs().exec('userOrgs'),
      // look for the org with the matching username
      mw.req('userOrgs').mapValues(
        invoke('filter', valueEquals('login.toLowerCase()', 'session.requestedUsername'))),
      // check to see if we've found an org
      mw.req('userOrgs.length').validate(equals(1))
        .then(mw.req().set('session.requestedUsername', 'userOrgs[0].login.toLowerCase()'))
        .else(logoutWhitelistFalse)
    ), // !validate (requested username !== user's username)
    userWhitelist.findOne({
      lowerName: 'session.requestedUsername',
      allowed: true
    }),
    // if the user isn't in the whitelist, logout and redirect
    flow.asyncIf(checkFound('userWhitelist')).else(logoutWhitelistFalse)
  ), // !syncIf enforceAuthWhitelist
  function (req, res) {
    // FIXME: protocol hardcoded
    res.redirect(req.session.authCallbackRedirect || 'http://' + process.env.DOMAIN);
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
