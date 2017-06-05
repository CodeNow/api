'use strict'

const migrator = require('./migrator')

const logger = require('logger')
const log = logger.child({
  module: 'Migrator-up'
})
migrator.runFromDir('./migrations', (error, results) => {
  if (error) {
    return log.error(error, { results })
  }
  log.trace('successfully migrated', results)
})