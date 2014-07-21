'use strict';
var cors = require('cors');
var envIs = require('101/env-is');

module.exports = cors({
  methods: 'GET,PUT,POST,PATCH,DELETE,DEL',
  origin: function (origin, callback) {
    var allow = envIs('development', 'test') ?
      true :
      (origin === 'http://'+process.env.DOMAIN);
    callback(null, allow);
  },
  credentials: true
});