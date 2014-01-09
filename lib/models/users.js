var ObjectId, Schema, async, bcrypt, configs, crypto, decodeId, encodeId, error, images, minus, mongoose, plus, publicFields, slash, underscore, userSchema;
async = require('async');
bcrypt = require('bcrypt');
configs = require('../configs');
crypto = require('crypto');
error = require('../error');
mongoose = require('mongoose');
images = require('./images');
Schema = mongoose.Schema;
ObjectId = Schema.ObjectId;
userSchema = new Schema({
  email: {
    type: String,
    index: true
  },
  password: { type: String },
  name: { type: String },
  company: { type: String },
  username: {
    type: String,
    index: true
  },
  lower_username: {
    type: String,
    index: { sparse: true }
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
userSchema.index({
  _id: 1,
  created: 1,
  permission_level: 1
});
userSchema.set('toJSON', { virtuals: true });
userSchema.set('autoIndex', false);
userSchema.virtual('gravitar').get(function () {
  var ghash, hash;
  if (!this.email) {
    return void 0;
  } else {
    hash = crypto.createHash('md5');
    hash.update(this.email);
    ghash = hash.digest('hex');
    return 'http://www.gravatar.com/avatar/' + ghash;
  }
});
userSchema.virtual('registered').get(function () {
  return this.permission_level >= 1;
});
userSchema.virtual('isVerified').get(function () {
  return this.permission_level >= 2;
});
userSchema.virtual('isModerator').get(function () {
  return this.permission_level >= 5;
});
publicFields = {
  username: 1,
  name: 1,
  fb_userid: 1,
  email: 1,
  created: 1,
  show_email: 1,
  company: 1
};
userSchema.statics.createUser = function (domain, cb) {
  var user;
  user = new this();
  return user.save(domain.intercept(function () {
    return cb(null, user);
  }));
};
userSchema.statics.findUser = function (domain, params, cb) {
  var minCreated;
  minCreated = Date.now() - configs.tokenExpires;
  params.$or = [
    { created: { $gte: minCreated } },
    { permission_level: { $gt: 0 } }
  ];
  return this.findOne(params, domain.intercept(function (user) {
    return cb(null, user);
  }));
};
userSchema.statics.removeUser = function (domain, userId, cb) {
  return this.remove({ _id: userId }, domain.intercept(function () {
    return cb();
  }));
};
userSchema.statics.loginUser = function (domain, login, password, cb) {
  var query;
  query = {
    $or: [
      { username: login },
      { email: login }
    ]
  };
  return this.findOne(query, domain.intercept(function (user) {
    if (!user) {
      return cb(error(404, 'user not found'));
    } else {
      if (configs.passwordSalt) {
        return bcrypt.compare(password + configs.passwordSalt, user.password, function (err, matches) {
          if (err) {
            throw err;
          }
          if (!matches) {
            return cb(error(403, 'invalid password'));
          } else {
            return cb(null, user._id);
          }
        });
      } else {
        if (password !== user.password) {
          return cb(error(403, 'invalid password'));
        } else {
          return cb(null, user._id);
        }
      }
    }
  }));
};
userSchema.statics.updateUser = function (domain, userId, data, fields, cb) {
  var options;
  if (typeof fields === 'function') {
    cb = fields;
    fields = null;
  }
  options = fields ? { fields: fields } : {};
  return this.findOneAndUpdate({ _id: userId }, { $set: data }, options, domain.intercept(function (user) {
    return cb(null, user.toJSON());
  }));
};
userSchema.statics.registerUser = function (domain, userId, data, cb) {
  var setPassword, _this = this;
  setPassword = function (password) {
    return _this.findOne({
      $or: [
        { email: data.email },
        { lower_username: data.username.toLowerCase() }
      ]
    }, domain.intercept(function (user) {
      var cmd, collision;
      if (user) {
        collision = data.email === user.email ? 'email' : 'username';
        return cb(error(403, collision + ' already exists'));
      } else {
        cmd = {
          $set: {
            email: data.email,
            password: password,
            permission_level: 1
          }
        };
        if (data.username) {
          cmd.$set.username = data.username;
          cmd.$set.lower_username = data.username.toLowerCase();
        }
        return _this.findByIdAndUpdate(userId, cmd, domain.intercept(function (user) {
          return cb(null, user);
        }));
      }
    }));
  };
  if (!configs.passwordSalt) {
    return setPassword(data.password);
  } else {
    return bcrypt.hash(data.password + configs.passwordSalt, 10, function (err, hash) {
      if (err) {
        throw err;
      }
      return setPassword(hash);
    });
  }
};
userSchema.statics.publicListWithIds = function (domain, userIds, cb) {
  var query;
  query = { _id: { $in: userIds } };
  return this.publicList(domain, query, cb);
};
userSchema.statics.publicList = function (domain, query, cb) {
  return this.find(query, publicFields, domain.intercept(function (users) {
    return async.map(users, function (user, cb) {
      user = user.toJSON();
      if (!user.show_email) {
        user.email = void 0;
      }
      if (users.length === 1) {
        return images.count({ owner: user._id }, domain.intercept(function (imagesCount) {
          user.imagesCount = imagesCount;
          return cb(null, user);
        }));
      } else {
        return cb(null, user);
      }
    }, cb);
  }));
};
userSchema.statics.addVote = function (domain, userId, runnableId, cb) {
  var createVote, query, self, update, vote;
  self = this;
  createVote = function (data) {
    var newrunnable;
    newrunnable = new self();
    newrunnable.votes.push(data);
    return newrunnable.votes[0];
  };
  vote = createVote({ runnable: runnableId });
  query = {
    _id: userId,
    'votes.runnable': { $ne: runnableId }
  };
  update = { $push: { votes: vote } };
  return this.update(query, update, domain.intercept(function (success) {
    if (!success) {
      return cb(error(403, 'you already voted on this runnable'));
    } else {
      return cb(null, vote);
    }
  }));
};
userSchema.statics.channelLeaders = function (domain, channelId, idsOnly, cb) {
  var self;
  self = this;
  return images.distinct('owner', { 'tags.channel': channelId }, function (err, userIds) {
    if (err) {
      cb(err);
    } else {
      return async.waterfall([
        function (cb) {
          var users;
          if (idsOnly) {
            users = userIds.map(function (userId) {
              return { _id: userId };
            });
            return cb(null, users);
          } else {
            return self.find({ _id: { $in: userIds } }, publicFields, domain.intercept(function (users) {
              return cb(null, users);
            }));
          }
        },
        function (users, cb) {
          return async.map(users, function (user, cb) {
            return images.countInChannelByOwner(domain, channelId, user._id, function (err, count) {
              if (err) {
                return cb(err);
              } else {
                user.count = count;
                return cb(null, user);
              }
            });
          }, cb);
        }
      ], cb);
    }
  });
};
userSchema.methods.getVotes = function () {
  var json_vote, vote, votes, _i, _len, _ref;
  votes = [];
  _ref = this.votes;
  for (_i = 0, _len = _ref.length; _i < _len; _i++) {
    vote = _ref[_i];
    json_vote = vote.toJSON();
    json_vote.runnable = encodeId(json_vote.runnable);
    votes.push(json_vote);
  }
  return votes;
};
userSchema.methods.addVote = function (domain, runnableId, cb) {
  var found, vote, _i, _len, _ref, _this = this;
  found = false;
  _ref = this.votes;
  for (_i = 0, _len = _ref.length; _i < _len; _i++) {
    vote = _ref[_i];
    if (vote.runnable.toString() === runnableId.toString()) {
      found = true;
    }
  }
  if (found) {
    return cb(error(403, 'cannot vote on runnable more than once'));
  } else {
    this.votes.push({ runnable: runnableId });
    return this.save(domain.intercept(function () {
      vote = _this.votes[_this.votes.length - 1].toJSON();
      vote.runnable = encodeId(vote.runnable);
      return cb(null, vote);
    }));
  }
};
userSchema.methods.removeVote = function (domain, voteId, cb) {
  var vote;
  vote = this.votes.id(voteId);
  if (!vote) {
    return cb(error(404, 'vote not found'));
  } else {
    vote.remove();
    return this.save(domain.intercept(function () {
      return cb();
    }));
  }
};
module.exports = mongoose.model('Users', userSchema);
plus = /\+/g;
slash = /\//g;
minus = /-/g;
underscore = /_/g;
encodeId = function (id) {
  return id;
};
decodeId = function (id) {
  return id;
};
if (configs.shortProjectIds) {
  encodeId = function (id) {
    return new Buffer(id.toString(), 'hex').toString('base64').replace(plus, '-').replace(slash, '_');
  };
  decodeId = function (id) {
    return new Buffer(id.toString().replace(minus, '+').replace(underscore, '/'), 'base64').toString('hex');
  };
}