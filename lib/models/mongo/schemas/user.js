'use strict';

var mongoose = require('mongoose');
var BaseSchema = require('models/mongo/schemas/base');
var Schema = mongoose.Schema;
var ObjectId = Schema.ObjectId;
var _ = require('lodash');
var crypto = require('crypto');


/** @alias module:models/user */
var UserSchema = module.exports = new Schema({
  /** Emails must be unique.
   *  @type: string */
  email: {
    type: String,
    index: { unique: true, sparse: true }
  },
  /** @type: string */
  password: { type: String },
  /** @type: string */
  name: { type: String },
  /** @type: string */
  company: { type: String },
  /** Usernames must be unique.
   *  @type: string */
  username: {
    type: String,
    index: { unique: true, sparse: true }
  },
  /** Lowercase username must be unique.
   *  @type: string */
  lower_username: {
    type: String,
    index: { unique: true, sparse: true }
  },
  /** @type: boolean */
  show_email: { type: Boolean },
  /** @type: number */
  permission_level: {
    type: Number,
    'default': 0
  },
  /** @type: date */
  created: {
    type: Date,
    'default': Date.now
  },
  /** @type: string */
  initial_referrer: { type: String },
  /** @type: number */
  copies: {
    type: Number,
    'default': 0
  },
  /** @type: number */
  pastes: {
    type: Number,
    'default': 0
  },
  /** @type: number */
  cuts: {
    type: Number,
    'default': 0
  },
  /** @type: number */
  runs: {
    type: Number,
    'default': 0
  },
  /** @type: number */
  views: {
    type: Number,
    'default': 0
  },
  /** A record of votes that the user has casted
   *  @example [{runnable: 'someObjectId'},...]
   *  @type: array.object */
  votes: {
    type: [{
      runnable: {
        type: ObjectId,
        index: { sparse: true }
      }
    }],
    'default': []
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
    ref: 'Users'
  }],
  /** List of the group members' user IDs
   *  @type array.ObjectId */
  groupMembers: [{
    type: ObjectId,
    ref: 'Users'
  }]
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
  // auto set lower_username when username is set
  this.lower_username = (username && username.toString) ?
    username.toString().toLowerCase() :
    this.lower_username = username;

  return username;
});

_.extend(UserSchema.methods, BaseSchema.methods);
_.extend(UserSchema.statics, BaseSchema.statics);