/**
 * Delete context-version when it turns unused
 * @module lib/workers/context-version.delete
 */
'use strict'

var Promise = require('bluebird')
var TaskFatalError = require('ponos').TaskFatalError
var log = require('middlewares/logger')(__filename).log

module.exports = ContextVersionDelete

/**
 * Handle context-version.delete command
 * @param {Object} job - Job info
 * @returns {Promise}
 */
function ContextVersionDelete (job) {
  var logData = {
    tx: true,
    data: job
  }
  log.info(logData, 'ContextVersionDelete')
  return Promise.try(function () {
    throw TaskFatalError('TODO: Not throw an error')
  })
}

