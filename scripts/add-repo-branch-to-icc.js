'use strict'
/**
 * This script removes all but the latest AutoIsolationConfig associated with an instance
 */
require('loadenv')()
const AutoIsolationConfigs = require('models/mongo/auto-isolation-config')
const AutoIsolationService = require('models/services/auto-isolation-service')
const InputClusterConfig = require('models/mongo/input-cluster-config')
const mongoose = require('mongoose')
const Promise = require('bluebird')
const logger = require('logger')
const log = logger.child({
  module: 'Migrator-up'
})
mongoose.connect(process.env.MONGO)

const dryRun = !process.env.ACTUALLY_RUN

log.trace('dryRun?', !!dryRun)

AutoIsolationConfigs.findAsync({})
  .map(config => InputClusterConfig.findActiveByAutoIsolationId(config._id)
    .then(icc => {
      if (icc.repo) { return }
      return AutoIsolationService.fetchMainInstance(config)
        .then(instance => {
          return { instance, config, icc }
        })
    })
    .catch(() => {}) // Ignore errors, like ICC not found, since we don't care
  )
  .filter(model => !!model)
  .map(model => {
    const icc = model.icc
    const instance = model.instance
    icc.set('repo', instance.getRepoName())
    icc.set('branch', instance.getMainBranchName())
    if (dryRun) {
      return log.trace('Saving New Values on ICC ', icc)
    }
    return icc.save()
  })
  .then(function () {
    log.trace('done.')
    Promise.fromCallback(cb => mongoose.disconnect(cb))
  })
  .catch(function (err) {
    log.error('error happened', err)
    throw err
  })
