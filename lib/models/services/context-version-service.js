'use strict'

const Boom = require('dat-middleware').Boom
const keypather = require('keypather')()
const uuid = require('uuid')

const Context = require('models/mongo/context')
const ContextVersion = require('models/mongo/context-version')
const InfraCodeVersionService = require('models/services/infracode-version-service')
const logger = require('logger')

const ContextVersionService = module.exports = {}

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
  const log = ContextVersionService.logger.child({
    id: id,
    method: 'findContextVersion'
  })
  log.info('called')
  return ContextVersion.findByIdAsync(id)
    .tap(function (contextVersion) {
      if (!contextVersion) {
        log.error('Context Version not found')
        throw Boom.notFound('Context Version not found', { id: id })
      }
    })
}

/**
 * Handler to deal with deep copying Context Versions.
 * If it is a CV owned by HelloRunnable, it creates a new deep copy and replaces
 * the owner with the user provided (session user), creating a new context and
 * copying the infracode files as well. Otherwise, it just creates a new context
 * version.
 * @param {Context}        context           - Context object that 'owns' the contextVersion.
 * @param {ContextVersion} contextVersion    - Context Version to copy.
 * @param {SessionUser}    user              - User object (most likely sessionUser).
 * @param {Object}         opts              - Opts to allow overrides for the owner.
 * @param {Object}         opts.owner        - Owner override
 * @param {Number}         opts.owner.github - Github ID of Owner with which to override.
 *
 * @resolves {ContextVersion} Newly forked ContextVersion
 *
 */
ContextVersionService.handleVersionDeepCopy = function (context, contextVersion, user, opts) {
  const log = this.logger.child({
    contextId: context._id,
    contextVersionId: contextVersion._id,
    method: 'handleVersionDeepCopy'
  })
  log.info('called')
  if (!opts) {
    opts = {}
  }
  const contextOwnerId = keypather.get(context, 'owner.github')
  const userGithubId = keypather.get(user, 'accounts.github.id')
  // 1. deep copy contextVersion
  return ContextVersion.createDeepCopyAsync(user, contextVersion)
    .tap(newContextVersion => {
      // check if the context version is (owned by hellorunnable AND the user isn't hellorunnable)
      if (contextOwnerId !== process.env.HELLO_RUNNABLE_GITHUB_ID || userGithubId === contextOwnerId) {
        return newContextVersion
      }
      // 2. create new context
      const ownerGithubObject = {
        github: keypather.get(opts, 'owner.github') || userGithubId
      }
      newContextVersion.set('owner', ownerGithubObject)
      const newContext = new Context({
        name: uuid(),
        owner: ownerGithubObject
      })
      return newContext.saveAsync()
        .tap(newContext => newContextVersion.set('context', newContext._id))
        .then(() => newContextVersion.saveAsync())
        .then(() =>
          InfraCodeVersionService.copyInfraCodeToContextVersion(newContextVersion, contextVersion.infraCodeVersion)
        )
    })
}
