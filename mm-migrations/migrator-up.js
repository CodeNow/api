'use strict'

const migrator = require('./migrator').migrator
const path = require('path')
const Promise = require('bluebird')
const logger = require('logger')
const log = logger.child({
  module: 'Migrator-up'
})
const migrationPath = path.resolve('./mm-migrations/migrations')

function traceEnd (id, result) {
  log.trace(`Finished id ${id}, migrating ${result}`)
}

if (!process.env.IS_QUEUE_WORKER) {
  Promise.fromCallback(cb => migrator.runFromDir(migrationPath, cb, traceEnd))
    .tap(result => log.trace('successfully migrated', result))
    .catch(err => log.error('failed to migrate', err))
}

