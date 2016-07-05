/**
 * @module lib/models/services/infracode-version-service
 */
'use strict'

require('loadenv')('models/services/infracode-version-service')

var Boom = require('dat-middleware').Boom
var logger = require('logger')
var InfraCodeVersion = require('models/mongo/infra-code-version')

var InfraCodeVersionService = module.exports = {}

InfraCodeVersionService.logger = logger.child({
  tx: true,
  module: 'InfraCodeVersionService'
})

/**
 * Find a InfraCodeVersion and throw an error if ICV was not found or access denied
 * @param {String} icvId internal build id
 * @param {opts} opts optional mongo query options
 * @resolves with found ICV model
 * @throws   {Boom.badRequest} When build id is invalid
 * @throws   {Boom.notFound}   When build lookup failed
 * @throws   {Error}           When Mongo fails
 */
InfraCodeVersionService.findICV = function (icvId, opts) {
  var log = InfraCodeVersionService.logger.child({
    method: 'findICV',
    icvId: icvId
  })
  log.info('findICV: call')
  return InfraCodeVersion.findByIdAsync(icvId, opts)
    .tap(function checkICV (build) {
      if (!build) {
        log.error('findICV: ICV was not found')
        throw Boom.notFound('ICV not found', { icvId: icvId })
      }
    })
}
