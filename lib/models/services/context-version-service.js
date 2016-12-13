'use strict'

const async = require('async')
const Boom = require('dat-middleware').Boom
const isFunction = require('101/is-function')
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
 * @param {Object} context Context object that 'owns' the contextVersion.
 * @param {Object} contextVersion Context Version to copy.
 * @param {Object} user User object (most likely sessionUser).
 * @param {Object} [opts] Opts to allow overrides for the owner.
 * @param {Object} [opts.owner] Owner override
 * @param {Number} [opts.owner.github] Github ID of Owner with which to override.
 * @param {Function} cb Callback which returns (err, newContextVersion)
 */
ContextVersionService.handleVersionDeepCopy = function (context, contextVersion, user, opts, cb) {
  const log = this.logger.child({
    contextId: context._id,
    contextVersionId: contextVersion._id,
    method: 'handleVersionDeepCopy'
  })
  log.info('called')
  if (isFunction(opts)) {
    cb = opts
    opts = {}
  }
  const contextOwnerId = keypather.get(context, 'owner.github')
  const userGithubId = keypather.get(user, 'accounts.github.id')
  // 1. deep copy contextVersion
  ContextVersion.createDeepCopy(user, contextVersion, function (err, newContextVersion) {
    if (err) { return cb(err) }
    // check if the context version is (owned by hellorunnable AND the user isn't hellorunnable)
    if (contextOwnerId !== process.env.HELLO_RUNNABLE_GITHUB_ID || userGithubId === contextOwnerId) {
      return cb(null, newContextVersion)
    }
    // 2. create new context
    const ownerGithubId = keypather.get(opts, 'owner.github') || userGithubId
    const newContext = new Context({
      name: uuid(),
      owner: { github: ownerGithubId }
    })
    // 3. 'move' new contextVerion -> new context
    newContextVersion.context = newContext._id

    // 4. update the owner of the contextVersion
    newContextVersion.owner.github = ownerGithubId

    async.series([
      // 4.1. save context, version
      newContext.save.bind(newContext),
      newContextVersion.save.bind(newContextVersion),
      function (cb) {
        // 5. copy icv to the new cv
        InfraCodeVersionService.copyInfraCodeToContextVersion(newContextVersion, contextVersion.infraCodeVersion._id).asCallback(cb)
      }
    ], function (err, results) {
      // [1]: newContextVersion.save results
      // [1][0]: newContextVersion.save document
      // [1][1]: newContextVersion.save number affected
      cb(err, keypather.get(results, '[1][0]'))
    })
  })
}
