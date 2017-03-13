'use strict'
/**
 * This script removes all but the latest AutoIsolationConfig associated with an instance
 */
require('loadenv')()
var AutoIsolationConfigs = require('models/mongo/auto-isolation-config')
var mongoose = require('mongoose')
mongoose.connect(process.env.MONGO)
var Promise = require('bluebird')

var dryRun = !process.env.ACTUALLY_RUN

console.log('dryRun?', !!dryRun)

AutoIsolationConfigs.findAsync({})
  .then(function (configs) {
    // map them by instanceId
    const configsByInstanceId = configs.reduce((map, config) => {
      if (config.instance) {
        const instanceId = config.instance.toString()
        if (!map[instanceId]) {
          map[instanceId] = []
        }
        map[instanceId].push(config)
      }
      return map
    }, {})
    const allPromises = []
    Object.keys(configsByInstanceId).forEach((instanceId) => {
      let latestDateConfig
      configsByInstanceId[instanceId].forEach((config) => {
        if (!latestDateConfig) {
          latestDateConfig = config
        } else {
          if (config.created > latestDateConfig.created) {
            latestDateConfig = config
          }
        }
      })
      configsByInstanceId[instanceId].forEach((config) => {
        if (config !== latestDateConfig) {
          console.log('Removing Config', config);
          if (!dryRun) {
            allPromises.push(config.removeAsync())
          }
        }
      })
    })
    return Promise.all(allPromises)
  })
  .then(function () {
    console.log('done.')
  })
  .catch(function (err) {
    console.error('error happened', err)
    throw err
  })
