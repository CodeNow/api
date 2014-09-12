'use strict';
var StatsD = require('node-dogstatsd').StatsD;
var client = new StatsD({
  host: process.env.DATADOG_HOST,
  port: process.env.DATADOG_PORT
});
module.exports = client;