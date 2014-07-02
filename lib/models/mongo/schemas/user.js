'use strict';

var mongoose = require('mongoose');
var BaseSchema = require('models/mongo/schemas/base');
var Schema = mongoose.Schema;
var ObjectId = Schema.ObjectId;
var _ = require('lodash');
var crypto = require('crypto');
var validators = require('../schemas/schema-validators').commonValidators;


/** @alias module:models/user */
var UserSchema = module.exports = new Schema({
  /** Emails must be unique.
   *  @type: string */
  email: {
    type: String,
    index: { unique: true, sparse: true },
//    required: true,
    validate : validators.email({model: "User", literal: "Email"})
  },
  /** @type: string */
  password: {
    type: String
  },
  /** @type: string */
  name: {
    type: String,
    validate : validators.alphaNumName({model: "User", literal: "name"})
  },
  /** @type: string */
  company: {
    type: String,
    validate : validators.alphaNumName({model: "User", literal: "name"})
  },
  /** Usernames must be unique.
   *  @type: string */
  username: {
    type: String,
    index: { unique: true, sparse: true },
//    required: 'Users require a Username',
    validate : validators.urlSafe({model: "User", literal: "Username"})
  },
  /** Lowercase username must be unique.
   *  @type: string */
  lowerUsername: {
    type: String,
    index: { unique: true, sparse: true },
//    required: 'Users require a Lower_Username',
    validate : validators.urlSafe({model: "User", literal: "Lower Username"})
  },
  /** @type: boolean */
  show_email: {
    type: Boolean,
    'default': false
  },
  /** @type: number */
  permission_level: {
    type: Number,
    'default': 0,
    required: 'Users require a Permission Level'
  },
  /** @type: date */
  created: {
    type: Date,
    'default': Date.now
  },
  /** @type: string */
  initial_referrer: {
    type: String,
    validate : validators.stringLengthValidator({model: "User", literal: "name"}, 200)
  },
  // FIXME: just so I know, here's the new GROUP related stuff
  /** Boolean if the User is a 'Group' or not
   *  @type boolean */
  isGroup: {
    type: Boolean,
    'default': false
  },
  /** List of the group owners' user IDs
   *  @type array.ObjectId */
  groupOwners: [{
    type: ObjectId,
    ref: 'Users',
    validate : validators.objectId({model: "User", literal: "Group Owners"})
  }],
  /** List of the group members' user IDs
   *  @type array.ObjectId */
  groupMembers: [{
    type: ObjectId,
    ref: 'Users',
    validate : validators.objectId({model: "User", literal: "Group Members"})
  }],
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
          index: true
        },
        refreshToken: {
          type: String,
          index: true
        },
        username: {
          type: String,
          index: true
        },
        displayName: {
          type: String
        },
        emails: {
          type: [{
            value: {
              type: String
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
  permission_level: 1
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
  return this.permission_level >= 1;
});
UserSchema.virtual('isVerified').get(function () {
  return this.permission_level >= 2;
});
UserSchema.virtual('isModerator').get(function () {
  return this.permission_level >= 5;
});

UserSchema.path('username').set(function (username) {
  // auto set lowerUsername when username is set
  this.lowerUsername = (username && username.toString) ?
    username.toString().toLowerCase() : username;
  return username;
});

_.extend(UserSchema.methods, BaseSchema.methods);
_.extend(UserSchema.statics, BaseSchema.statics);
