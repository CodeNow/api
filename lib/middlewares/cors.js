'use strict'
var cors = require('cors')
var envIs = require('101/env-is')
var parseDomain = require('parse-domain')
var serverDomain = parseDomain(process.env.DOMAIN)


module.exports = cors({
  methods: 'GET,PUT,POST,PATCH,DELETE,DEL',
  origin: function (origin, callback) {
    var originMatchesDomain = false
    if (origin) {
      var originParsed = parseDomain(origin)
      originMatchesDomain = originParsed.domain === serverDomain.domain && originParsed.tld === serverDomain.tld
    }
    var allow = envIs('development', 'test', 'io', 'local', 'staging')
      ? true
      : originMatchesDomain
    if (process.env.ALLOW_ALL_CORS) {
      allow = true
    }
    callback(null, allow)
  },
  credentials: true
})
