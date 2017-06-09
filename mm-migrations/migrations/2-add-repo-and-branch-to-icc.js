'use strict'
require('../../lib/loadenv')()

const AutoIsolationConfigs = require('models/mongo/auto-isolation-config')
const AutoIsolationService = require('models/services/auto-isolation-service')
const InputClusterConfig = require('models/mongo/input-cluster-config')
const mongoose = require('mongoose')
const Promise = require('bluebird')
const logger = require('logger')
const log = logger.child({
  module: 'Migrator-up'
})
module.exports.id = 'ADD-REPO-AND-BRANCH-TO-ICC'

function logStuff () {
  log.trace.apply(log, arguments)
  console.log.apply(console, arguments)
}

function logError () {
  log.error.apply(log, arguments)
  console.error.apply(console, arguments)
}

module.exports.up = function (done) {
  logStuff('Add repo and Branch to ICC')
  // use this.db for MongoDB communication, and this.log() for logging
  return Promise.fromCallback(cb => mongoose.connect(process.env.MONGO, cb))
    .tap(() => logStuff('Connected to Mongo'))
    .then(() => AutoIsolationConfigs.findAllActive({}))
    .tap(() => logStuff('Found AICs'))
    .map(config => {
      return InputClusterConfig.findActiveByAutoIsolationId(config._id)
        .tap(icc => logStuff('Found icc', icc))
        .then(icc => {
          if (icc.repo) { return }
          return AutoIsolationService.fetchMainInstance(config)
            .then(instance => {
              return { instance, config, icc }
            })
        })
        // Ignore errors, like ICC not found, since we don't care
        .catch(() => {})
    })
    .filter(model => !!model)
    .map(model => {
      const icc = model.icc
      logStuff('Updating ICC id ', icc._id)
      const instance = model.instance
      icc.set('repo', instance.getRepoName())
      icc.set('branch', instance.getMainBranchName())
      return icc.save()
    })
    .tap(() => logStuff('done'))
    .then(() => Promise.fromCallback(cb => mongoose.disconnect(cb)))
    .catch(err => {
      logError('error happened', err)
      throw err
    })
    .asCallback(done)
}

module.exports.down = function (done) {
  // use this.db for MongoDB communication, and this.log() for logging
  done()
}
