/**
 * @module lib/models/services/infracode-version-service
 */
'use strict'

require('loadenv')('models/services/infracode-version-service')

const Boom = require('dat-middleware').Boom
const keypather = require('keypather')()
const logger = require('logger')
const Promise = require('bluebird')

const ContextService = require('models/services/context-service')
const InfraCodeVersion = require('models/mongo/infra-code-version')

const InfraCodeVersionService = module.exports = {}

InfraCodeVersionService.logger = logger.child({
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
  const log = InfraCodeVersionService.logger.child({
    method: 'findInfraCodeVersion',
    icvId: icvId
  })
  log.info('call')
  return InfraCodeVersion.findByIdAsync(icvId, opts)
    .tap(function checkICV (icv) {
      if (!icv) {
        log.error('findInfraCodeVersion: InfraCodeVersion was not found')
        throw Boom.notFound('InfraCodeVersion not found', { icvId: icvId })
      }
    })
}

/**
 * @param {Object} query to fetch infraCodeVersion
 * @rejects {InfraCodeVersion.NotFound} when infraCodeVersion was not found
 */
InfraCodeVersionService.findOneAndAssert = function (query) {
  const log = InfraCodeVersionService.logger.child({
    method: 'findOneAndAssert'
  })
  log.info('call')
  return InfraCodeVersion.findOneAsync(query)
    .tap((icv) => {
      if (!icv) {
        log.error('InfraCodeVersion was not found')
        throw new InfraCodeVersion.NotFound(query)
      }
    })
}

/**
 * Find default infraCodeVersion from the blank context
 */
InfraCodeVersionService.findBlankInfraCodeVersion = () => {
  const log = InfraCodeVersionService.logger.child({
    method: 'findBlankInfraCodeVersion'
  })
  log.info('call')
  const contextQuery = { 'name': 'Blank', 'isSource': true }
  return ContextService.findOneAndAssert(contextQuery)
    .then((blankContext) => {
      log.info({ context: blankContext }, 'found blank context')
      const infraQuery = { context: blankContext._id }
      return InfraCodeVersionService.findOneAndAssert(infraQuery)
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
  const targetInfraCodeVersionId = targetContextVersion.infraCodeVersion

  return Promise.try(function validateArgumets () {
    if (keypather.get(targetContextVersion, 'build.completed')) {
      throw Boom.badRequest('Cannot modify a built version.', { contextVersion: targetContextVersion })
    }

    if (keypather.get(targetContextVersion, 'build.started')) {
      throw Boom.badRequest('Cannot modify an in progress version.', { contextVersion: targetContextVersion })
    }

    if (!targetInfraCodeVersionId) {
      throw Boom.badRequest('Target context version has no infracode version.', { targetInfraCodeVersionId })
    }

    if (!sourceInfraCodeVersion) {
      throw Boom.badRequest('invalid query sourceInfraCodeVersion.', { sourceInfraCodeVersion })
    }
  })
  .then(function findSourceInfraCodeVersion () {
    return InfraCodeVersionService.findInfraCodeVersion(sourceInfraCodeVersion)
  })
  .then(function findTargetInfraCodeVersion (icv) {
    return InfraCodeVersionService.findInfraCodeVersion(targetContextVersion.infraCodeVersion)
  })
  .then(function cleanTargetInfraCodeVersion (targetInfraCodeVersion) {
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
