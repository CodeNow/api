'use strict';

var mongoose = require('mongoose');
var BaseSchema = require('models/mongo/schemas/base');
var Schema = mongoose.Schema;
var Mixed = Schema.Mixed;
var crypto = require('crypto');
var extend = require('extend');
var validators = require('../schemas/schema-validators').commonValidators;
var debug = require('debug')('runnable-api:user:model');

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
  /** @type: string */
  name: {
    type: String,
    validate: validators.name({model: 'User', literal: 'name'})
  },
  /** @type: string */
  company: {
    type: String,
    validate: validators.name({model: 'User', literal: 'company'})
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
  /** Accounts */
  accounts: {
    github: {
      type: {
        id: {
          type: String,
          index: true
        },
        accessToken: {
          type: String,
          index: true,
          validate: validators.token({model:'User', literal: 'Accounts access token'})
        },
        refreshToken: {
          type: String,
          index: true,
          validate: validators.token({model:'User', literal: 'Accounts access token'})
        },
        username: {
          type: String,
          index: { unique: true },
          validate: validators.urlSafe({model: 'User', literal: 'Github Username'})
        },
        displayName: {
          type: String
        },
        emails: {
          type: [{
            value: {
              type: String,
              validate: validators.email({model:'User', literal: 'Accounts Email'})
            }
          }]
        },
        _json: {
          type: Mixed
        }
      }
    }
  }
});
UserSchema.index({
  _id: 1,
  created: 1,
  permissionLevel: 1
});

UserSchema.set('toJSON', { virtuals: true });
UserSchema.virtual('_gravitar').get(function () {
  if (!this.email) {
    return void 0;
  } else {
    var hash = crypto.createHash('md5');
    hash.update(this.email);
    var ghash = hash.digest('hex');
    var gravitar = 'http://www.gravatar.com/avatar/' + ghash;
    return gravitar;
  }
});
UserSchema.virtual('registered').get(function () {
  return this.permissionLevel >= 1;
});
UserSchema.virtual('isVerified').get(function () {
  return this.permissionLevel >= 2;
});
UserSchema.virtual('isModerator').get(function () {
  return this.permissionLevel >= 5;
});

extend(UserSchema.methods, BaseSchema.methods);
extend(UserSchema.statics, BaseSchema.statics);
// UserSchema.post('init', function (doc) {
//  console.log('*** USER ****  %s has been initialized from the db', doc);
// });
UserSchema.pre('validate', function (next) {
  // Do validation here
  next();
});
UserSchema.post('validate', function (doc) {
  debug('*** USER ****  %s has been validated (but not saved yet)', doc);
});
UserSchema.post('save', function (doc) {
  debug('*** USER ****  %s has been saved', doc);
});
UserSchema.post('remove', function (doc) {
  debug('*** USER ****  %s has been removed', doc);
});


