/**
 * @module lib/models/mongo/schemas/user
 */
'use strict'

var extend = require('extend')
var keypather = require('keypather')()
var mongoose = require('mongoose')

var BaseSchema = require('models/mongo/schemas/base')
var logger = require('middlewares/logger')(__filename)
var validators = require('models/mongo/schemas/schema-validators').commonValidators

var Mixed = mongoose.Schema.Mixed
var ObjectId = mongoose.Schema.ObjectId
var Schema = mongoose.Schema

var log = logger.log

/** @alias module:models/user */
var UserSchema = module.exports = new Schema({
  /** Emails must be unique.
   *  @type: string */
  email: {
    type: String,
    index: { unique: true, sparse: true },
    required: 'Users require an Email Address',
    validate: validators.email({model: 'User', literal: 'Email'})
  },
  /** @type: boolean */
  showEmail: {
    type: Boolean,
    'default': false
  },
  /** @type: number */
  permissionLevel: {
    type: Number,
    'default': 0,
    required: 'Users require a Permission Level'
  },
  /** @type: date */
  created: {
    type: Date,
    'default': Date.now,
    validate: validators.beforeNow({model: 'User', literal: 'created'})
  },
  gravatar: {
    type: String,
    validate: validators.url({model: 'User', literal: 'gravatar'})
  },
  /** Accounts */
  accounts: {
    type: {
      github: {
        type: {
          id: {
            type: String,
            required: 'User Accounts require an Id',
            index: true
          },
          accessToken: {
            type: String,
            index: true,
            required: 'User Accounts require an Id',
            validate: validators.token({model: 'User', literal: 'Github access token'})
          },
          username: {
            type: String,
            index: { unique: true },
            required: 'User Accounts require a Username',
            validate: validators.urlSafe({model: 'User', literal: 'Github Username'})
          },
          displayName: {
            type: String
          },
          emails: {
            type: [
              {
                value: {
                  type: String,
                  validate: validators.email({model: 'User', literal: 'Github Emails'})
                }
              }
            ],
            required: 'Github Account requires at least one Email Address'
          },
          _json: {
            type: Mixed,
            required: 'User Accounts require the json response from GitHub'
          }
        }
      }
    }
  },
  routes: {
    type: [{
      /**
       * hostname which needs a mapping
       */
      srcHostname: {
        type: String
      // TODO: hostname validation
      },
      /**
       * the instance which the hostname will be routed to
       */
      destInstanceId: {
        type: ObjectId,
        ref: 'Instances'
      // required: true TODO: can this work here?
      }
    }]
  },
  userOptions: {
    type: {
      uiState: {
        type: {
          shownCoachMarks: Mixed,
          previousLocation: Mixed

        }
      }
    },
    sparse: true
  }
})
UserSchema.index({
  _id: 1,
  created: 1,
  permissionLevel: 1
})

/**
 * Strip sensitive properties from request responses
 * @param {Object} doc Mongoose document
 * @param {Object} ret Object-literal to transform
 * @return {Object}
 */
UserSchema._transformToJSON = function (doc, jsonResponseObject) {
  keypather.del(jsonResponseObject, 'accounts.github.accessToken')
  keypather.del(jsonResponseObject, 'accounts.github.access_token')
  keypather.del(jsonResponseObject, 'accounts.github._json')
  keypather.del(jsonResponseObject, 'accounts.github._raw')
  keypather.del(jsonResponseObject, 'accounts.github.refreshToken')
  return jsonResponseObject
}

UserSchema.set('toJSON', {
  virtuals: true
})

UserSchema.options.toJSON = {
  transform: UserSchema._transformToJSON
}

UserSchema.virtual('registered').get(function () {
  return this.permissionLevel >= 1
})
UserSchema.virtual('isVerified').get(function () {
  return this.permissionLevel >= 2
})
UserSchema.virtual('isModerator').get(function () {
  return this.permissionLevel >= 5
})

extend(UserSchema.methods, BaseSchema.methods)
extend(UserSchema.statics, BaseSchema.statics)

UserSchema.pre('validate', function (next) {
  // Do validation here
  next()
})
UserSchema.post('validate', function (doc) {
  log.trace({
    doc: doc
  }, 'user validated not saved')
})
UserSchema.post('save', function (doc) {
  log.trace({
    doc: doc
  }, 'user saved')
})
UserSchema.post('remove', function (doc) {
  log.trace({
    doc: doc
  }, 'user removed')
})
