'use strict'
var cors = require('cors')
var envIs = require('101/env-is')
var parseDomain = require('parse-domain')

module.exports = cors({
  methods: 'GET,PUT,POST,PATCH,DELETE,DEL',
  origin: function (origin, callback) {
    if (envIs('development', 'test', 'io', 'local', 'staging') || process.env.ALLOW_ALL_CORS) {
      return callback(null, true)
    }
    var serverDomain = parseDomain(process.env.FULL_API_DOMAIN)
    var allow = false
    if (origin) {
      var originParsed = parseDomain(origin)
      allow = originParsed.domain === serverDomain.domain && originParsed.tld === serverDomain.tld
    }
    callback(null, allow)
  },
  credentials: true
})
