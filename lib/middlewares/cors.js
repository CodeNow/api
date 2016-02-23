'use strict'
var cors = require('cors')
var parseDomain = require('parse-domain')

module.exports = cors({
  methods: 'GET,PUT,POST,PATCH,DELETE,DEL',
  origin: function (origin, callback) {
    if (process.env.ALLOW_ALL_CORS) {
      return callback(null, true)
    }
    var serverDomainParsed = parseDomain(process.env.FULL_API_DOMAIN)
    var originParsed = parseDomain(origin) || {}
    var allow = originParsed.domain === serverDomainParsed.domain && originParsed.tld === serverDomainParsed.tld
    callback(null, allow)
  },
  credentials: true
})
