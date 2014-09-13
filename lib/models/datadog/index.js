'use strict';
var StatsD = require('node-dogstatsd').StatsD;
var client = new StatsD(
  process.env.DATADOG_HOST,
  process.env.DATADOG_PORT);
  
module.exports = client;
