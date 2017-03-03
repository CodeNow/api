var parseDomain = require('parse-domain')
var exists = require('101/exists')

var csurfMiddleware = require('csurf')()

module.exports.csrfValidator = function (req, res, next) {
  if (!exists(req.headers.origin)) {
    // Bypass because we don't have an Origin meaning it's not a CORS request
    return next()
  }
  csurfMiddleware(req, res, next)
}

module.exports.injectCookie = function (res, req, domain) {
  var parsedDomain = parseDomain(domain) || {}
  res.cookie('CSRF-TOKEN', req.csrfToken(), {
    httpOnly: false,
    domain: '.' + parsedDomain.domain + '.' + parsedDomain.tld
  })
}

module.exports.csrfCookieInjector = function (req, res, next) {
  if (!exists(req.headers.origin)) {
    return next()
  }
  module.exports.injectCookie(res, req, process.env.FULL_API_DOMAIN)
  module.exports.injectCookie(res, req, process.env.SECONDARY_FULL_API_DOMAIN)
  next()
}
