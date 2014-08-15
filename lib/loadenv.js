'use strict';
var dotenv = require('dotenv');
var eson = require('eson');
var path = require('path');
var env = process.env.NODE_ENV || 'development';
var envIs = require('101/env-is');
var read = false;
var ROOT_DIR = path.resolve(__dirname, '..');

module.exports = readDotEnvConfigs;
function readDotEnvConfigs () {
  if (read === true) {
    return;
  }
  read = true;
  dotenv._getKeysAndValuesFromEnvFilePath(path.resolve(__dirname, '../configs/.env'));
  dotenv._getKeysAndValuesFromEnvFilePath(path.resolve(__dirname, '../configs/.env.'+ env));
  dotenv._setEnvs();
  dotenv.load();

  process.env = eson()
    .use(eson.ms)
    .use(convertStringToNumeral)
    .parse(JSON.stringify(process.env));

  process.env.ROOT_DIR = ROOT_DIR;
  if (!envIs('test')) {
    console.log('ENVIRONMENT CONFIG', process.env.NODE_ENV, process.env);
  }
}
function convertStringToNumeral(key, val) {
  if (typeof val === 'string' && ! isNaN(val)) {
    return parseInt(val);
  } else {
    return val;
  }
}