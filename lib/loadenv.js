/**
 * Load environmental variables and attach to process.env
 * @module lib/loadenv
 */
'use strict'
var dotenv = require('dotenv')
var eson = require('eson')
var path = require('path')
var execSync = require('sync-exec')
var env = process.env.NODE_ENV || 'development'
var uuid = require('uuid')
var read = false
var ROOT_DIR = path.resolve(__dirname, '..')

module.exports = readDotEnvConfigs
function readDotEnvConfigs () {
  if (read === true) {
    return
  }
  read = true
  dotenv._getKeysAndValuesFromEnvFilePath(path.resolve(__dirname, '../configs/.env'))
  dotenv._getKeysAndValuesFromEnvFilePath(path.resolve(__dirname, '../configs/.env.' + env))
  dotenv._setEnvs()
  dotenv.load()

  process.env = eson()
    .use(eson.ms)
    .use(convertStringToNumeral)
    .parse(JSON.stringify(process.env))

  process.env._VERSION_GIT_COMMIT = execSync('git rev-parse HEAD').stdout
  process.env._VERSION_GIT_BRANCH = execSync('git rev-parse --abbrev-ref HEAD').stdout
  process.env.UUID = uuid()

  process.env.ROOT_DIR = ROOT_DIR
}

function convertStringToNumeral (key, val) {
  if (typeof val === 'string' && !isNaN(val)) {
    return parseInt(val, 10)
  } else {
    return val
  }
}
