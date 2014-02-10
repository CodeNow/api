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
var UserSchema = new Schema({
  email: {
    type: String,
    index: { unique: true, sparse: true }
  },
  password: { type: String },
  name: { type: String },
  company: { type: String },
  username: {
    type: String,
    index: { unique: true, sparse: true }
  },
  lower_username: {
    type: String,
    index: { unique: true, sparse: true }
  },
  show_email: { type: Boolean },
  permission_level: {
    type: Number,
    'default': 0
  },
  created: {
    type: Date,
    'default': Date.now
  },
  initial_referrer: { type: String },
  copies: {
    type: Number,
    'default': 0
  },
  pastes: {
    type: Number,
    'default': 0
  },
  cuts: {
    type: Number,
    'default': 0
  },
  runs: {
    type: Number,
    'default': 0
  },
  views: {
    type: Number,
    'default': 0
  },
  votes: {
    type: [{
      runnable: {
        type: ObjectId,
        index: { sparse: true }
      }
    }],
    'default': []
  }
});
UserSchema.index({
  _id: 1,
  created: 1,
  permission_level: 1
});
UserSchema.set('toJSON', { virtuals: true });
UserSchema.virtual('gravitar').get(function () { // gravatar is misspelled...
  if (!this.email) {
    return void 0;
  } else {
    var hash = crypto.createHash('md5');
    hash.update(this.email);
    var ghash = hash.digest('hex');
    return 'http://www.gravatar.com/avatar/' + ghash;
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

UserSchema.methods.returnJSON = function (cb) {
  var json = this.toJSON();
  json.votes = this.getVotes();
  delete json.password;
  this.getImagesCount(function (err, imagesCount) {
    if (err) {
      return cb(err);
    }
    json.imagesCount = imagesCount;
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

// proxy callback to delete email if not public (show_email != true)
function proxyCallbackToProtectEmail (args) {
  var cb = _.last(args);
  if (typeof cb === 'function') { // cb found
    args[args.length - 1] = function (err, results) {
      if (results) {
        if (Array.isArray(results)) {
          results.forEach(protectEmail);
        }
        else {
          protectEmail(results);
        }
      }
      cb(err, results);
    };
  }
  function protectEmail (user) {
    if (!user.show_email) {
      user.gravitar = user.toJSON().gravitar;
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
    return next(error(403, 'cannot vote on your own runnable'));
  }
  else if (this.hasVotedOn(image)) {
    return next(error(403, 'you already voted on this runnable'));
  }
  else {
    var domain = require('domain').create();
    domain.on('error', callback);
    async.parallel({
      image: image.incVotes,
      user: userAddVote
    },
    domain.intercept(function (results) {
      if (results.user) { // user updated
        self.set('votes', results.user.votes);
      }
      callback(null, self);
    }));
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