var parseDomain = require("parse-domain");

module.exports.csrfValidator = require('csurf')({
  ignoreMethods: process.env.CSRF_IGNORED_METHODS.split(',')
})

module.exports.csrfCookieInjector = function (req, res, next) {
  var parsedDomain = parseDomain(process.env.FULL_API_DOMAIN) || {}
  res.cookie('CSRF-TOKEN', req.csrfToken(), {
    httpOnly: false,
    domain: '.' + parsedDomain.domain + '.' + parsedDomain.tld
  })
  next()
}
