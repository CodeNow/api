'use strict'
var cors = require('cors')
var parseDomain = require('parse-domain')

module.exports = cors({
  methods: 'GET,PUT,POST,PATCH,DELETE,DEL',
  origin: function (origin, callback) {
    if (process.env.ALLOW_ALL_CORS) {
      return callback(null, true)
    }
    var originParsed = parseDomain(origin) || {}
    var allow = [
      process.env.FULL_API_DOMAIN,
      process.env.FULL_FRONTEND_DOMAIN
    ]
      .some(function (domain) {
        var serverDomainParsed = parseDomain(domain) || {}
        return (
          originParsed.domain === serverDomainParsed.domain &&
          originParsed.tld === serverDomainParsed.tld
        )
      })
    callback(null, allow)
  },
  credentials: true
})
