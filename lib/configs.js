'use strict';
var dotenv = require('dotenv');
var eson = require('eson');
var os = require('os');
var path = require('path');
var uuid = require('node-uuid');
var env = process.env.NODE_ENV || 'development';
module.exports = readDotEnvConfigs();

function readDotEnvConfigs () {
  var path = require('path');
  dotenv._getKeysAndValuesFromEnvFilePath(path.resolve(__dirname, '../configs/.env.'+ env));
  dotenv._setEnvs();
  dotenv.load();

  process.env = eson()
    .use(eson.ms)
    .parse(JSON.stringify(process.env));
}