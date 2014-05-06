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
var Image = require('models/images');
var BaseSchema = require('models/BaseSchema');
var Schema = mongoose.Schema;
var ObjectId = Schema.ObjectId;
var utils = require('middleware/utils');
var encodeId = utils.encodeId;
var bcrypt = require('bcrypt');
var error = require('error');

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
  groupOwners: [Schema.Types.ObjectId],
  /** List of the group members' user IDs
   *  @type array.ObjectId */
  groupMembers: [Schema.Types.ObjectId]
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
  if (opts.noImageCounts) {
    return cb(null, json);
  }
  async.parallel({
    imagesCount: this.getImagesCount.bind(this),
    taggedImagesCount: this.getTaggedImagesCount.bind(this)
  },
  function (err, results) {
    if (err) {
      return cb(err);
    }
    _.extend(json, results);
    cb(null, json);
  });
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
UserSchema.methods.getImagesCount = function (cb) {
  Image.count({ owner: this._id }, cb);
};
UserSchema.methods.getTaggedImagesCount = function (cb) {
  Image.count({
    owner: this._id,
    tags: { $not: { $size: 0 } }
  }, cb);
};

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
UserSchema.methods.isOwnerOf = function (model) {
  return (utils.equalObjectIds(this._id, model.owner));
};
UserSchema.methods.hasVotedOn = function (image) {
  var vote = _.findWhere(this.votes, function (vote) {
    return utils.equalObjectIds(vote.runnable, image._id);
  });
  return Boolean(vote);
};

UserSchema.methods.removeVote = function (voteId, callback) {
  var self = this;
  var vote = this.votes.id(voteId);
  if (!vote) {
    callback(error(404, 'vote not found'));
  }
  else {
    var domain = require('domain').create();
    domain.on('error', callback);
    async.parallel({
      image: Image.decVotesById.bind(Image, vote.runnable),
      user: userRemoveVote
    },
    domain.intercept(function (results) {
      var success = false;
      if (results.user) { // user updated
        self.set('votes', results.user.votes);
        success = true;
      }
      callback(null, success);
    }));
  }
  function userRemoveVote (cb) {
    var query = {
      _id: self._id,
      'votes.runnable': vote._id
    };
    var update = {
      $pull: {
        votes: { _id: vote._id }
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

var User = module.exports = mongoose.model('Users', UserSchema);
