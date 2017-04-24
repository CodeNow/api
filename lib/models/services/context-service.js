/**
 * @module lib/models/services/context-service
 */
'use strict'

require('loadenv')('models/services/context-service')

const Boom = require('dat-middleware').Boom
const keypather = require('keypather')()
const pick = require('101/pick')

const Context = require('models/mongo/context')
const joi = require('utils/joi')
const logger = require('logger')
const PermissionService = require('models/services/permission-service')

function ContextService () {}

ContextService.logger = logger.child({
  module: 'ContextService'
})

module.exports = ContextService

const newContextSchema = joi.object({
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
  const fields = sessionUser.isModerator
  ? [ 'owner', 'name', 'isSource' ]
  : [ 'owner', 'name' ]
  const data = pick(payload, fields)
  const log = this.logger.child({
    data: data,
    method: 'createNew'
  })
  log.info('called')
  if (data && !keypather.get(data, 'owner.github')) {
    const userGithubId = keypather.get(sessionUser, 'accounts.github.id')
    keypather.set(data, 'owner.github', userGithubId)
    log.debug({ userGithubId }, 'set context owner to sessionUser')
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
  const log = ContextService.logger.child({
    id: id,
    method: 'findContext'
  })
  log.info('called')
  return Context.findByIdAsync(id)
    .tap(function (context) {
      if (!context) {
        log.error('Context not found')
        throw Boom.notFound('Context not found', { id: id })
      }
    })
}

/**
 * @param {Object} query to fetch context
 * @rejects {Context.NotFoundError} when context was not found
 */
ContextService.findOneAndAssert = function (query) {
  const log = ContextService.logger.child({
    method: 'findOneAndAssert'
  })
  log.info('called')
  return Context.findOneAsync(query)
    .tap((context) => {
      if (!context) {
        log.error('Context was not found')
        throw new Context.NotFoundError(query)
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
  const log = ContextService.logger.child({
    id: id,
    method: 'findContextAndAssertAccess'
  })
  log.info('called')
  return ContextService.findContext(id)
    .tap(function (context) {
      return PermissionService.ensureOwnerOrModerator(sessionUser, context)
    })
}
