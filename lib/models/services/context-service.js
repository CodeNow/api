/**
 * @module lib/models/services/context-service
 */
'use strict'

require('loadenv')('models/services/context-service')

var async = require('async')
var Boom = require('dat-middleware').Boom
var isFunction = require('101/is-function')
var keypather = require('keypather')()
var pick = require('101/pick')
var uuid = require('uuid')

var Context = require('models/mongo/context')
var ContextVersion = require('models/mongo/context-version')
var InfraCodeVersionService = require('models/services/infracode-version-service')
var joi = require('utils/joi')
var logger = require('logger')
var PermissionService = require('models/services/permission-service')

function ContextService () {}

ContextService.logger = logger.child({
  module: 'ContextService'
})

module.exports = ContextService

var newContextSchema = joi.object({
  name: joi.string().required(),
  owner: joi.object({
    github: joi.number().required()
  }).required().unknown(),
  isSource: joi.boolean()
}).unknown().label('context')

/**
 * Create new context
 * @param {User} user object that creates context
 * @param {Object} initial context payload
 * @param {String} [opts.name] Context name
 * @param {Object} [opts.owner] Owner override
 * @param {Number} [opts.owner.github] Github ID of Owner with which to override.
 * @param {Boolean} [opts.isSource] flag to indicate template context
 * @returns {Promise} Resolved when Context model was saved or validation failed
 */
ContextService.createNew = function (sessionUser, payload) {
  var fields = sessionUser.isModerator
  ? [ 'owner', 'name', 'isSource' ]
  : [ 'owner', 'name' ]
  var data = pick(payload, fields)
  var log = this.logger.child({
    data: data,
    method: 'createNew'
  })
  log.info('call')
  if (data && !keypather.get(data, 'owner.github')) {
    data.owner = {
      github: keypather.get(sessionUser, 'accounts.github.id')
    }
  }
  return joi.validateOrBoomAsync(data, newContextSchema)
    .then(function () {
      if (sessionUser.isModerator) {
        return
      }
      return PermissionService.isOwnerOf(sessionUser, data)
    })
    .then(function () {
      return Context.createAsync(data)
    })
}

/**
 * Find context by `id`
 * @param {ObjectId} id - context id
 * @returns {Promise}
 * @resolves {Object} context mongo model
 * @throws   {Boom.notFound}   When context lookup failed
 * @throws   {Error}           When Mongo fails
 */
ContextService.findContext = function (id) {
  var log = ContextService.logger.child({
    id: id,
    method: 'ContextService.findContext'
  })
  log.info('call')
  return Context.findByIdAsync(id)
    .tap(function (context) {
      if (!context) {
        log.error('Context not found')
        throw Boom.notFound('Context not found', { id: id })
      }
    })
}

/**
 * Find context by `id` and check permissions
 * @param {ObjectId} id - context id
 * @param {Object} sessionUser mongo user model
 * @returns {Promise}
 * @resolves {Object} context mongo model
 * @throws   {Boom.notFound}   When context lookup failed
 * @throws   {Boom.forbidden}  When context perm check failed failed
 * @throws   {Error}           When Mongo fails
 */
ContextService.findContextAndAssertAccess = function (id, sessionUser) {
  var log = ContextService.logger.child({
    id: id,
    method: 'ContextService.findContextAndAssertAccess'
  })
  log.info('call')
  return ContextService.findContext(id)
    .tap(function (context) {
      return PermissionService.ensureOwnerOrModerator(sessionUser, context)
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
ContextService.handleVersionDeepCopy = function (context, contextVersion, user, opts, cb) {
  var log = this.logger.child({
    contextId: context._id,
    contextVersionId: contextVersion._id,
    method: 'handleVersionDeepCopy'
  })
  log.info('call')
  if (isFunction(opts)) {
    cb = opts
    opts = {}
  }
  var contextOwnerId = keypather.get(context, 'owner.github')
  var userGithubId = keypather.get(user, 'accounts.github.id')
  // 1. deep copy contextVersion
  ContextVersion.createDeepCopy(user, contextVersion, function (err, newContextVersion) {
    if (err) { return cb(err) }
    // check if the context version is (owned by hellorunnable AND the user isn't hellorunnable)
    if (contextOwnerId !== process.env.HELLO_RUNNABLE_GITHUB_ID || userGithubId === contextOwnerId) {
      return cb(null, newContextVersion)
    }
    // 2. create new context
    var ownerGithubId = keypather.get(opts, 'owner.github') || userGithubId
    var newContext = new Context({
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
