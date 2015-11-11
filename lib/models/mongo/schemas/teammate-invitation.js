/**
 * @module lib/models/mongo/schemas/user
 */
'use strict'

var extend = require('extend')
var mongoose = require('mongoose')
var Boom = require('dat-middleware').Boom

var BaseSchema = require('models/mongo/schemas/base')
var logger = require('middlewares/logger')(__filename)
var validators = require('models/mongo/schemas/schema-validators').commonValidators

var ObjectId = mongoose.Schema.ObjectId
var Schema = mongoose.Schema

var log = logger.log

/** @alias module:models/user */
var TeammateInvitation = module.exports = new Schema({
  /** @type: date */
  created: {
    type: Date,
    'default': Date.now,
    validate: validators.beforeNow({model: 'User', literal: 'created'})
  },
  recipient: {
    required: 'A recipient for the invitation is required',
    type: {
      github: {
        type: Number,
        index: true
      },
      /**  @type: string */
      email: {
        type: String,
        validate: validators.email({model: 'TeammateInvitation', literal: 'email'})
      }
    }
  },
  sender: {
    type: ObjectId,
    ref: 'User',
    required: 'The user who sent the invitation is required',
    validate: validators.objectId({model: 'TeammateInvitation', literal: 'User'})
  },
  organization: {
    required: 'The organization to which the sender and receiver belong to is required',
    type: {
      github: {
        type: Number,
        index: true
      }
    }
  }
})

extend(TeammateInvitation.methods, BaseSchema.methods)
extend(TeammateInvitation.statics, BaseSchema.statics)

TeammateInvitation.post('validate', function (doc) {
  log.trace({
    tx: true,
    doc: doc
  }, 'TeammateInvitation validated not saved')
})
TeammateInvitation.post('remove', function (doc) {
  log.trace({
    tx: true,
    doc: doc
  }, 'TeammateInvitation removed')
})
/* jshint maxcomplexity:20 */
TeammateInvitation.pre('save', function (next) {
  var err
  if (!this.recipient || (!this.recipient.github)) {
    err = Boom.badRequest("Invitation's recipient github ID is required")
    err.name = 'ValidationError'
    next(err)
  } else if (!this.recipient || (!this.recipient.email)) {
    err = Boom.badRequest("Invitation's recipient email is required")
    err.name = 'ValidationError'
    next(err)
  } else if (!this.organization || (!this.organization.github)) {
    err = Boom.badRequest("Invitation's organization github ID is required")
    err.name = 'ValidationError'
    next(err)
  } else if (isNaN(this.recipient.github)) {
    err = Boom.badRequest("Invitation's recipient github ID must be a number")
    err.name = 'ValidationError'
    next(err)
  } else if (isNaN(this.organization.github)) {
    err = Boom.badRequest("Invitation's organization github ID must be a number")
    err.name = 'ValidationError'
    next(err)
  } else if (this.recipient.email) {
    var emailValidator = validators.email({model: 'TeammateInvitation', literal: 'email'})
    emailValidator.forEach(function (entry) {
      if (entry.validator) {
        entry.validator(this.recipient.email, function (isValid) {
          if (!isValid) {
            err = new mongoose.Error.ValidationError(this)
            err.errors = {
              'recipient.email': {
                value: this.recipient.email,
                message: ' does not contain a valid email address...'
              }
            }
            next(err)
          }
        }.bind(this))
      }
    }.bind(this))
    next()
  } else {
    next()
  }
})
