'use strict'

const logger = require('logger')
const log = logger.child({
  module: 'Migrator'
})
const config = require('./config')

const mm = require('mongodb-migrations')
const migrator = new mm.Migrator(config, (level, message) => {
  log.trace(message, { level })
})

module.exports.migrator = migrator
