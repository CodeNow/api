'use strict';

var debug = require('debug')('runnable-api:routes:auth:github');
var express = require('express');
var mw = require('dat-middleware');

var error = require('error');
var passport = require('middlewares/passport');
var RedisToken = require('models/redis/token');

var app = module.exports = express();


// GET /auth/github
//   Use passport.authenticate() as route middleware to authenticate the
//   request.  The first step in GitHub authentication will involve redirecting
//   the user to github.com.  After authorization, GitHubwill redirect the user
//   back to this application at /auth/github/callback
app.get('/auth/github',
  mw.req().set('session.authCallbackRedirect', 'query.redirect'),
  mw.req().set('session.requiresToken', 'query.requiresToken'),
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
  function (req, res) {
    var session = req.session;
    debug('callback session', session);
    if (session.requiresToken) {
      var token = new RedisToken();
      return token.setValue(session.passport.user, function (err, token) {
        // if setting token failed do not send token
        if (err) {
          error.log(err);
        } else {
          session.authCallbackRedirect += '?token='+ token;
        }
        res.redirect(session.authCallbackRedirect || getFallbackUrl(req));
        delete session.authCallbackRedirect;
      });
    }
    // FIXME: protocol hardcoded
    res.redirect(session.authCallbackRedirect || getFallbackUrl(req));
    delete session.authCallbackRedirect;
  }
);

function getFallbackUrl (req) {
   var host = req.headers.host;
  // append 80 if port not in url
  if (!~host.indexOf(':')) {
    host = host + ':80';
  }
  // we only support https on port 443
  var protocol = host.split(':')[1] === '443' ?
    'https://' : 'http://';

  return protocol + process.env.DOMAIN;
}

app.post('/auth/github/token',
  mw.body('accessToken').require(),
  passport.authenticate('github-token'),
  mw.res.send(200));
