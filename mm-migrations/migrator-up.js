'use strict'

const migrator = require('./migrator').migrator
const path = require('path')
const logger = require('logger')
const log = logger.child({
  module: 'Migrator-up'
})
const migrationPath = path.resolve('./mm-migrations/migrations')
migrator.runFromDir(migrationPath, (error, results) => {
  if (error) {
    return log.error(error, { results })
  }
  log.trace('successfully migrated', results)
}, (id, result) => {
  log.trace(`Finished id ${id}, migrating ${result}`)
})
