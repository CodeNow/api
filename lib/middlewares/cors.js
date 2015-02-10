'use strict';
var cors = require('cors');
var envIs = require('101/env-is');
var url = require('url');

module.exports = cors({
  methods: 'GET,PUT,POST,PATCH,DELETE,DEL',
  origin: function (origin, callback) {
    var originMatchesDomain = false;
    if (origin) {
      var originParsed = url.parse(origin);
      originMatchesDomain = (originParsed.host === process.env.DOMAIN);
    }
    var allow = envIs('development', 'test', 'io', 'local', 'staging') ?
      true :
      (originMatchesDomain);
    callback(null, allow);
  },
  credentials: true
});
