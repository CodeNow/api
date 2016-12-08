'use strict'

/**
 * Contexts represent a single Docker build context, which can be associated with both
 * images and containers.
 * @module models/context
 */
const BaseError = require('error-cat/errors/base-error')
const Boom = require('dat-middleware').Boom
const logger = require('middlewares/logger')(__filename)
const mongoose = require('mongoose')
const pluck = require('101/pluck')
const Promise = require('bluebird')

const ContextSchema = require('models/mongo/schemas/context')

const log = logger.log

/**
 * Error thrown when an context is not found
 * @param {Object} query     - query made for context
 * @param {Object} data      - extra error data
 * @param {Object} reporting - reporting options
 */
class NotFoundError extends BaseError {
  constructor (query) {
    super('Context not found', { query }, { level: 'debug' })
  }
}

ContextSchema.statics.NotFoundError = NotFoundError

/** Check to see if a context is public.
 *  @param {function} [cb] function (err, {@link module:models/context Context}) */
ContextSchema.methods.isPublic = function (cb) {
  log.trace({
    isPublic: this.isPublic
  }, 'isPublic')
  var err
  if (!this.public) {
    err = Boom.forbidden('Context is private')
  }
  cb(err, this)
}

ContextSchema.statics.findByVersions = function (contextVersions, cb) {
  log.trace({
    contextVersions: contextVersions
  }, 'findByVersions')
  var contextIds = contextVersions.map(pluck('context'))
  this.findByIds(contextIds, cb)
}

var Context = module.exports = mongoose.model('Contexts', ContextSchema)
Promise.promisifyAll(Context)
Promise.promisifyAll(Context.prototype)
