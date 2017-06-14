'use strict'

const migrator = require('./migrator').migrator
const logger = require('logger')
const log = logger.child({
  module: 'Migrator-up'
})

function traceProgress (id, result) {
  log.trace(`Finished id ${id}, rolling back ${result}`)
}
function traceEnd (err, result) {
  migrator.dispose(() => {
    if (err) {
      return log.error('failed to roll back', err)
    }
    log.trace('successfully rolled back', result)
  })
}
migrator.rollback(traceEnd, traceProgress)
