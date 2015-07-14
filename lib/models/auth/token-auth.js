/**
 * TokenAuth used to share sessions with other applications
 * @module lib/models/apis/token-auth.js
 */
'use strict';

var keypather = require('keypather')();
var querystring = require('querystring');
var url = require('url');

var RedisToken = require('models/redis/token');
var error = require('error');
var logger = require('middlewares/logger')(__filename);

var log = logger.log;

module.exports = TokenAuth;

function TokenAuth () {}

/**
 * returns true if token was requested
 * @param  {object}  session user's session
 * @return {boolean} true if token requested, else false
 */
function isRequested (session) {
  var requiresToken = keypather.get(session, 'requiresToken');
  log.trace({
    tx: true,
    session: session
  }, 'isRequested');
  return !!requiresToken;
}
/**
 * sends session cookie to requester so api client can share the same session
 * should only be called if session.requiresToken exist
 * @param  {object}   session user's session
 * @param  {Function} cb      (null)
 */
TokenAuth.createWithSessionCookie = function (session, cookie, cb) {
  log.trace({
    tx: true,
    session: session,
    cookie: cookie
  }, 'createWithSessionCookie');
  if (!isRequested(session)) { return cb(null); }
  var token = new RedisToken();
  token.setValue(cookie, function (err) {
    // if setting token failed do not send token
    if (err) {
      error.log(err);
    } else {
      // append querystring correctly
      var targetObj = url.parse(session.authCallbackRedirect);
      var qs = querystring.parse(targetObj.query);
      qs.runnableappAccessToken = token.getKey();
      targetObj.search = querystring.stringify(qs);
      delete targetObj.query;
      var targetUrl = url.format(targetObj);
      session.authCallbackRedirect = targetUrl;
    }
    cb(null);
  });
};
