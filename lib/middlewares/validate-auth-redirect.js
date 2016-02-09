/**
 * Assert that a redirect URL is an acceptable value. Prevent Phishing attacks.
 * Unset req.query.redirect if value is invalid
 * @module lib/middlewares/validate-auth-redirect
 */
'use strict'

var find = require('101/find')
var url = require('url')

var log = require('middlewares/logger')(__filename).log

var validRedirectTLDs = process.env.VALID_REDIR_TLDS.split(',')

module.exports = function (req, res, next) {
  var logData = {
    tx: true,
    redirect: req.query.redirect
  }
  log.info(logData, 'middlwares/validate-auth-redirect')
  if (req.query.redirect) {
    var parsedRedirect = url.parse(req.query.redirect)
    var match = find(validRedirectTLDs, function (topLevelDomain) {
      return new RegExp(topLevelDomain + '$').test(parsedRedirect.hostname)
    })
    if (!match) {
      log.trace(logData, 'middlwares/validate-auth-redirect invalid redirect detected')
      delete req.query.redirect
    }
  }
  next()
}
