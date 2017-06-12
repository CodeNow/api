'use strict'

const migrator = require('./migrator').migrator
const path = require('path')
const logger = require('logger')
const log = logger.child({
  module: 'Migrator-up'
})
const migrationPath = path.resolve('./mm-migrations/migrations')

function traceEnd (id, result) {
  log.trace(`Finished id ${id}, migrating ${result}`)
  process.exit()
}
function traceProgress (err, result) {
  if (err) {
    return log.error('failed to migrate', err)
  }
  log.trace('successfully migrated', result)
}
migrator.runFromDir(migrationPath, traceEnd, traceProgress)
