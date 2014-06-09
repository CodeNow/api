'use strict';

/**
 * Users are going to represent both individual users and Groups as well.
 * Groups will not be allowed to log in, however they will be owned by Users
 * @module models/user
 */

var _ = require('lodash');
var async = require('async');
var configs = require('configs');
var crypto = require('crypto');
var mongoose = require('mongoose');
var BaseSchema = require('models/mongo/base');
var Schema = mongoose.Schema;
var ObjectId = Schema.ObjectId;
var utils = require('middlewares/utils');
var encodeId = utils.encodeId;
var bcrypt = require('bcrypt');
var error = require('error');

var findIndex = require('101/find-index');
var Boom = require('dat-middleware').Boom;
var debug = require('debug')('runnableApi:user:model');

/** @alias module:models/user */
var UserSchema = new Schema({
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
var publicFields = {
  _id: 1,
  username: 1,
  name: 1,
  email: 1,
  created: 1,
  show_email: 1,
  company: 1
};

UserSchema.path('username').set(function (username) {
  // auto set lower_username when username is set
  this.lower_username = (username && username.toString) ?
    username.toString().toLowerCase() :
    this.lower_username = username;

  return username;
});

_.extend(UserSchema.methods, BaseSchema.methods);
_.extend(UserSchema.statics, BaseSchema.statics);

UserSchema.methods.checkPassword = function (password, cb) {
  bcrypt.compare(password + configs.passwordSalt, this.password, cb);
};

UserSchema.methods.returnJSON = function (opts, cb) {
  if (typeof opts === 'function') {
    cb = opts;
    opts = {};
  }
  var json = this.toJSON();
  json.votes = this.getVotes();
  delete json.password;
  cb(null, json);
  // if (opts.noImageCounts) {
  //   return cb(null, json);
  // }
  // async.parallel({
  //   imagesCount: this.getImagesCount.bind(this),
  //   taggedImagesCount: this.getTaggedImagesCount.bind(this)
  // },
  // function (err, results) {
  //   if (err) {
  //     return cb(err);
  //   }
  //   _.extend(json, results);
  //   cb(null, json);
  // });
};
UserSchema.methods.getVotes = function () {
  if (!this.votes) {
    return this.votes;
  }
  return this.votes.map(function (vote) {
    var json = vote.toJSON();
    json.runnable = encodeId(json.runnable);
    return json;
  });
};
// UserSchema.methods.getImagesCount = function (cb) {
//   Image.count({ owner: this._id }, cb);
// };
// UserSchema.methods.getTaggedImagesCount = function (cb) {
//   Image.count({
//     owner: this._id,
//     tags: { $not: { $size: 0 } }
//   }, cb);
// };

// proxy callback to delete email if not public (show_email != true)
function proxyCallbackToProtectEmail (args) {
  var cb = _.last(args);
  if (typeof cb === 'function') { // cb found
    args[args.length - 1] = function (err, user) {
      if (user) {
        if (Array.isArray(user)) {
          user.forEach(protectEmail);
        }
        else {
          protectEmail(user);
        }
      }
      cb(err, user);
    };
  }
  function protectEmail (user) {
    if (!user.show_email) {
      user.set('gravitar', user.toJSON()._gravitar, { strict: false });
      user.email = undefined;
    }
  }
}
UserSchema.statics.publicFind = function () {
  var args = Array.prototype.slice.call(arguments);
  if (typeof args[1] === 'function') {
    args[2] = args[1]; // arg1 is cb so shift and insert fields
  }
  args[1] = publicFields;
  proxyCallbackToProtectEmail(args);
  this.find.apply(this, args);
};
UserSchema.statics.publicFindOne = function () {
  var args = Array.prototype.slice.call(arguments);
  if (typeof args[1] === 'function') {
    args[2] = args[1]; // arg1 is cb so shift and insert fields
  }
  args[1] = publicFields;
  proxyCallbackToProtectEmail(args);
  this.findOne.apply(this, args);
};
UserSchema.statics.publicFindById = function () {
  var args = Array.prototype.slice.call(arguments);
  if (typeof args[1] === 'function') {
    args[2] = args[1]; // arg1 is cb so shift and insert fields
  }
  args[1] = publicFields;
  proxyCallbackToProtectEmail(args);
  this.findById.apply(this, args);
};
UserSchema.statics.findByUsername = function (username) {
  var args = Array.prototype.slice.call(arguments, 1);
  args.unshift({ lower_username: username.toLowerCase() });
  this.findOne.apply(this, args);
};
UserSchema.methods.voteOn = function (image, callback) {
  var self = this;
  if (this.isOwnerOf('image')) {
    return callback(error(403, 'cannot vote on your own runnable'));
  } else if (this.hasVotedOn(image)) {
    return callback(error(403, 'you already voted on this runnable'));
  } else {
    var domain = require('domain').create();
    domain.on('error', callback);
    async.parallel({
      image: imageAddVote,
      user: userAddVote
    },
    domain.intercept(function (results) {
      if (results.user) { // user updated
        self.set('votes', results.user.votes);
      }
      callback(null, self);
    }));
  }
  function imageAddVote (cb) {
    image.incVotes(cb);
  }
  function userAddVote (cb) {
    self.votes.push({ runnable: image._id });
    var vote = _.last(self.votes);
    var query = {
      _id: self._id,
      'votes.runnable': { $ne: vote._id }
    };
    var update = {
      $push: {
        votes: vote.toJSON()
      }
    };
    var opts = {
      fields: {
        votes:1
      }
    };
    User.findByIdAndUpdate(query, update, opts, cb);
  }
};
UserSchema.methods.isOwnerOf = function (model, cb) {
  // `this` is the user we are checking against.
  // if model is a group, we look in the 
  debug('ids: ' + model.owner + ' ' + this._id);
  debug('model.isGroup: ' + model.isGroup);
  if (model.isGroup && checkGroupOwners(this._id, model.groupOwners)) {
    debug('group owner check success');
    return cb(null);
  }
  // if the model is not a group, first check if the owner is `this` (me)
  else if (equalToId(this._id)(model.owner)) {
    debug('model owner check success');
    return cb(null);
  }
  // else, lets assume that the owner is a group, and populate the owner and check the members
  else if (model.owner) {
    debug('checking if owner is a group');
    var self = this;
    User.findOne({ _id: model.owner, isGroup: true }, function (err, body) {
      if (err) { return cb(err); }
      else if (!body) { return cb(Boom.forbidden('access denied (!owner)')); }

      if (body.isGroup && checkGroupOwners(self._id, body.groupMembers)) {
        debug('owning group check success');
        return cb(null);
      } else {
        debug('owning group check failure');
        return cb(Boom.forbidden('access denied (!owner)'));
      }
    });
  } else {
    return cb(Boom.forbidden('access denied (!owner)'));
  }

  function equalToId(userId) {
    return function (modelId) {
      return utils.equalObjectIds(userId, modelId);
    };
  }
  function checkGroupOwners(userId, groupIds) {
    var index = findIndex(groupIds, equalToId(userId));
    return index !== -1;
  }
};
UserSchema.methods.hasVotedOn = function (image) {
  var vote = _.findWhere(this.votes, function (vote) {
    return utils.equalObjectIds(vote.runnable, image._id);
  });
  return Boolean(vote);
};

var User = module.exports = mongoose.model('Users', UserSchema);
