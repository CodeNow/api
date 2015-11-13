/**
 * TokenAuth used to share sessions with other applications
 * @module lib/models/apis/token-auth.js
 */
'use strict'

var keypather = require('keypather')()
var put = require('101/put')
var querystring = require('querystring')
var url = require('url')

var RedisToken = require('models/redis/token')
var error = require('error')
var logger = require('middlewares/logger')(__filename)

var log = logger.log

module.exports = TokenAuth

function TokenAuth () {}

/**
 * returns true if token was requested
 * @param  {object}  session user's session
 * @return {boolean} true if token requested, else false
 */
function isRequested (session) {
  var requiresToken = keypather.get(session, 'requiresToken')
  log.trace({
    tx: true,
    session: session
  }, 'isRequested')
  return !!requiresToken
}

/**
 * Inserts the current API sessionId into redis at a uuid-key and assigns the uuid-key as a value
 * to the session property which is later used to redirect a request to another service (navi) that
 * will use the uuid-key to retrieve the API sessionId from redis.
 *
 * Temporarily also inserts a session cookie into redis with the sessionId. This will be removed
 * with completion of SAN-2911
 * https://runnable.atlassian.net/browse/SAN-2911
 * @param {Array} List of IDs the user belongs to
 * @param {String} User's github ID
 * @param  {object}   session user's session
 * @param  {Function} cb      (null)
 */
TokenAuth.addPropsToSession = function (orgIds, userId, session, cookie, cb) {
  // TODO: remove the `cookie` arg
  var logData = {
    tx: true,
    session: session,
    orgIds: orgIds,
    userId: userId,
    cookie: cookie
  }
  log.info(logData, 'TokenAuth.addPropsToSession')
  if (!isRequested(session)) {
    log.trace(logData, 'addPropsToSession !isRequested(session)')
    return cb(null)
  }
  var redisInsertValue = JSON.stringify({
    cookie: cookie,
    userGithubOrgs: orgIds,
    userId: userId,
    apiSessionRedisKey: process.env.REDIS_SESSION_STORE_PREFIX + session.id
  })
  var token = new RedisToken()
  logData.redisInsertValue = redisInsertValue
  log.trace(logData, 'addPropsToSession token.setValue')
  token.setValue(redisInsertValue, function (err) {
    // if setting token failed do not send token
    if (err) {
      log.error(put({
        err: err
      }, logData), 'addPropsToSession token.setValue error')
      error.log(err)
    } else {
      // append querystring correctly
      var targetObj = url.parse(session.authCallbackRedirect)
      var qs = querystring.parse(targetObj.query)
      qs.runnableappAccessToken = token.getKey()
      targetObj.search = querystring.stringify(qs)
      log.trace(put({
        targetObj: targetObj,
        qs: qs
      }, logData), 'addPropsToSession token.setValue success')
      delete targetObj.query
      var targetUrl = url.format(targetObj)
      log.trace(put({
        targetUrl: targetUrl
      }, logData), 'addPropsToSession token.setValue success targetUrl')
      session.authCallbackRedirect = targetUrl
    }
    cb(null)
  })
}
