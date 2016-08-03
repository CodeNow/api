/**
 * @module lib/models/services/infracode-version-service
 */
'use strict'

require('loadenv')('models/services/infracode-version-service')

var Boom = require('dat-middleware').Boom
var keypather = require('keypather')()
var logger = require('logger')
var Promise = require('bluebird')

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
 * @returns {Promise}
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

/**
 * copies a source infracode version to a target context version
 * @param  {ContextVersion} targetContextVersion    cv where the icv will be copied to
 * @param  {String}         sourceInfraCodeVersion  Id of icv to copy from
 * @return {Promise}
 * @resolves {InfraCodeVersion} updated target's InfraCodeVersion
 * @rejects {Boom.badRequest} If targets build is completed
 * @rejects {Boom.badRequest} If targets build started
 * @rejects {Boom.badRequest} If targets does not have icv
 * @rejects {Boom.badRequest} If source icv not provided
 * @rejects {Boom.notFound}   If source icv not found
 * @rejects {Boom.notFound}   If target icv not found
 */
InfraCodeVersionService.copyInfraCodeToContextVersion = function (targetContextVersion, sourceInfraCodeVersion) {
  var targetInfraCodeVersionId = targetContextVersion.infraCodeVersion

  return Promise.try(function validateArgumets () {
    if (keypather.get(targetContextVersion, 'build.completed')) {
      throw Boom.badRequest('Cannot modify a built version.')
    }

    if (keypather.get(targetContextVersion, 'build.started')) {
      throw Boom.badRequest('Cannot modify an in progress version.')
    }

    if (!targetInfraCodeVersionId) {
      throw Boom.badRequest('Target context version has no infracode version.')
    }

    if (!sourceInfraCodeVersion) {
      throw Boom.badRequest('invalid query sourceInfraCodeVersion.')
    }
  })
  .then(function findSourceInfraCodeVersion () {
    return InfraCodeVersion.findByIdAsync(sourceInfraCodeVersion)
  })
  .tap(function checkSourceInfraCodeVersion (icv) {
    if (!icv) {
      throw Boom.notFound('souce infracode version not found')
    }
  })
  .then(function findTargetInfraCodeVersion (icv) {
    return InfraCodeVersionService.findInfraCodeVersion(targetContextVersion.infraCodeVersion)
  })
  .tap(function cleanTargetInfraCodeVersion (targetInfraCodeVersion) {
    return targetInfraCodeVersion.removeSourceDirAsync()
  })
  .then(function copyFromSourceToTarget (updatedICV) {
    return updatedICV.copyFilesFromSourceAsync(sourceInfraCodeVersion)
  })
  .then(function updateAndReturnTargetInfraCodeVersion () {
    return InfraCodeVersion.updateByIdAsync(targetInfraCodeVersionId, {
      $set: {
        parent: sourceInfraCodeVersion
      }
    })
  })
}
