'use strict';
var dotenv = require('dotenv');
var eson = require('eson');
var os = require('os');
var path = require('path');
var uuid = require('node-uuid');
var env = process.env.NODE_ENV || 'development';
module.exports = readDotEnvConfigs;

function readDotEnvConfigs () {
  dotenv._getKeysAndValuesFromEnvFilePath(path.resolve(__dirname, '../configs/.env.'+ env));
  dotenv._setEnvs();
  dotenv.load();

  process.env = eson()
    .use(eson.ms)
    .use(convertStringToNumeral)
    .use(eson.replace('{ROOT_DIR}', path.normalize(__dirname + '/..')))
    .use(eson.replace('{RAND_NUM}', uuid.v4().split('-')[0]))
    .use(eson.replace('{HOME_DIR}', process.env.HOME))
    .use(eson.replace('{CURR_DIR}', __dirname + '/../configs'))
    .use(eson.replace('{RAND_DIR}', os.tmpDir() + '/' + uuid.v4()))
    .parse(JSON.stringify(process.env));


}
function convertStringToNumeral(key, val) {
  if (typeof val === 'string' && ! isNaN(val)) {
    return parseInt(val);
  } else {
    return val;
  }
}
