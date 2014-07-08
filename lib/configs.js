'use strict';
var dotenv = require('dotenv');
var eson = require('eson');
var os = require('os');
var path = require('path');
var uuid = require('node-uuid');
//var env = process.env.NODE_ENV || 'development';
function readConfigs (filename) {
  readDotEnvConfigs();
  return eson()
    .use(eson.ms)
    .use(eson.replace('{ROOT_DIR}', path.normalize(__dirname + '/..')))
    .use(eson.replace('{RAND_NUM}', uuid.v4().split('-')[0]))
    .use(eson.replace('{HOME_DIR}', process.env.HOME))
    .use(eson.replace('{CURR_DIR}', __dirname + '/../configs'))
    .use(eson.replace('{RAND_DIR}', os.tmpDir() + '/' + uuid.v4()))
    .read(__dirname + '/../configs/' + filename + '.json');
}
module.exports = readDotEnvConfigs();
//module.exports.readConfigs = readConfigs;
//module.exports.readDotEnvConfigs = readDotEnvConfigs;
function readDotEnvConfigs () {
  dotenv._getKeysAndValuesFromEnvFilePath('/Users/nathan/runnable/api/configs/.env.test');
  dotenv._setEnvs();
  dotenv.load();
}