'use strict'

/**
 * Contexts represent a single Docker build context, which can be associated with both
 * images and containers.
 * @module models/context
 */

var Boom = require('dat-middleware').Boom
var logger = require('middlewares/logger')(__filename)
var mongoose = require('mongoose')
var pluck = require('101/pluck')

var ContextSchema = require('models/mongo/schemas/context')

var log = logger.log

/** Check to see if a context is public.
 *  @param {function} [cb] function (err, {@link module:models/context Context}) */
ContextSchema.methods.isPublic = function (cb) {
  log.trace({
    tx: true,
    isPublic: this.isPublic
  }, 'isPublic')
  var err
  if (!this.public) {
    err = Boom.forbidden('Context is private')
  }
  cb(err, this)
}

ContextSchema.statics.createBy = function (props, cb) {
  log.trace({
    tx: true,
    props: props
  }, 'createBy')
  var context = new Context(props)
  context.set({
    owner: props.owner
  })
  cb(null, context)
}

ContextSchema.statics.findByVersions = function (contextVersions, cb) {
  log.trace({
    tx: true,
    contextVersions: contextVersions
  }, 'findByVersions')
  var contextIds = contextVersions.map(pluck('context'))
  this.findByIds(contextIds, cb)
}

var Context = module.exports = mongoose.model('Contexts', ContextSchema)
