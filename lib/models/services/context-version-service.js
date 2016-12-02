'use strict'

var Boom = require('dat-middleware').Boom
var ContextVersion = require('models/mongo/context-version')
var logger = require('logger')

var ContextVersionService = module.exports = {}

ContextVersionService.logger = logger.child({
  module: 'ContextVersionService'
})

/**
 * TODO: replace with contextVersion.findAndAssert
 * Find context version by `id`
 * @param {ObjectId} id - context version id
 * @returns {Promise}
 * @resolves {Object} context version mongo model
 * @throws   {Boom.notFound}   When context version lookup failed
 * @throws   {Error}           When Mongo fails
 */
ContextVersionService.findContextVersion = function (id) {
  var log = ContextVersionService.logger.child({
    id: id,
    method: 'findContextVersion'
  })
  log.info('findContextVersion call')
  return ContextVersion.findByIdAsync(id)
    .tap(function (contextVersion) {
      if (!contextVersion) {
        log.error('Context Version not found')
        throw Boom.notFound('Context Version not found', { id: id })
      }
    })
}
