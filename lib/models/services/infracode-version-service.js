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
 * @param {String} icvId internal ICV id
 * @param {opts} opts optional mongo query options
 * @resolves with found ICV model
 * @throws   {Boom.notFound}   When ICV lookup failed
 * @throws   {Error}           When Mongo fails
 */
InfraCodeVersionService.findInfraCodeVersion = function (icvId, opts) {
  var log = InfraCodeVersionService.logger.child({
    method: 'findInfraCodeVersion',
    icvId: icvId
  })
  log.info('findInfraCodeVersion: call')
  return InfraCodeVersion.findByIdAsync(icvId, opts)
    .tap(function checkICV (icv) {
      if (!icv) {
        log.error('findInfraCodeVersion: InfraCodeVersion was not found')
        throw Boom.notFound('InfraCodeVersion not found', { icvId: icvId })
      }
    })
}