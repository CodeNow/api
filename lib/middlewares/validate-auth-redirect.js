/**
 * Assert that a redirect URL is an acceptable value. Prevent Phishing attacks.
 * Unset req.query.redirect if value is invalid
 * @module lib/middlewares/validate-auth-redirect
 */
'use strict'

var find = require('101/find')
var url = require('url')

module.exports = function (req, res, next) {
  if (req.query.redirect) {
    var parsedRedirect = url.parse(req.query.redirect)
    var match = find(validRedirectTLDs, function (topLevelDomain) {
      return new RegExp(topLevelDomain + '$').test(parsedRedirect.hostname)
    })
    if (!match) {
      delete req.query.redirect
    }
  }
  next()
}

var validRedirectTLDs = module.exports.validRedirectTLDs = [
  'codenow.com',
  'runnable-beta.com',
  'runnablecloud.com',
  'runnablecodesnippets.com',
  'runnable.com',
  'runnable-gamma.com',
  'runnable.io',
  'runnable.ninja'
]
