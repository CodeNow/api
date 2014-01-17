var async = require('async');
var bcrypt = require('bcrypt');
var configs = require('../configs');
var crypto = require('crypto');
var error = require('../error');
var mongoose = require('mongoose');
var images = require('./images');
var Schema = mongoose.Schema;
var ObjectId = Schema.ObjectId;
var userSchema = new Schema({
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
  if (!this.email) {
    return void 0;
  } else {
    var hash = crypto.createHash('md5');
    hash.update(this.email);
    var ghash = hash.digest('hex');
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
var publicFields = {
  username: 1,
  name: 1,
  fb_userid: 1,
  email: 1,
  created: 1,
  show_email: 1,
  company: 1
};
userSchema.statics.loginUser = function (domain, login, password, cb) {
  var query = {
    $or: [
      { username: login },
      { email: login }
    ]
  };
  this.findOne(query, domain.intercept(function (user) {
    if (!user) {
      cb(error(404, 'user not found'));
    } else if (configs.passwordSalt) {
      bcrypt.compare(password + configs.passwordSalt, user.password, domain.intercept(function (matches) {
        if (!matches) {
          cb(error(403, 'invalid password'));
        } else {
          cb(null, user._id);
        }
      }));
    } else {
      if (password !== user.password) {
        cb(error(403, 'invalid password'));
      } else {
        cb(null, user._id);
      }
    }
  }));
};
userSchema.statics.publicListWithIds = function (domain, userIds, cb) {
  var query;
  query = { _id: { $in: userIds } };
  this.publicList(domain, query, cb);
};
userSchema.statics.publicList = function (domain, query, cb) {
  this.find(query, publicFields, domain.intercept(function (users) {
    async.map(users, function (user, cb) {
      user = user.toJSON();
      if (!user.show_email) {
        user.email = void 0;
      }
      if (users.length === 1) {
        images.count({ owner: user._id }, domain.intercept(function (imagesCount) {
          user.imagesCount = imagesCount;
          cb(null, user);
        }));
      } else {
        cb(null, user);
      }
    }, cb);
  }));
};
userSchema.statics.addVote = function (domain, userId, runnableId, cb) {
  var self = this;
  var createVote = function (data) {
    var newrunnable = new self();
    newrunnable.votes.push(data);
    return newrunnable.votes[0];
  };
  var vote = createVote({ runnable: runnableId });
  var query = {
    _id: userId,
    'votes.runnable': { $ne: runnableId }
  };
  var update = { $push: { votes: vote } };
  this.update(query, update, domain.intercept(function (success) {
    if (!success) {
      cb(error(403, 'you already voted on this runnable'));
    } else {
      cb(null, vote);
    }
  }));
};
userSchema.statics.channelLeaders = function (domain, channelId, idsOnly, cb) {
  var self = this;
  images.distinct('owner', { 'tags.channel': channelId }, domain.intercept(function (userIds) {
    async.waterfall([
      function (cb) {
        if (idsOnly) {
          var users = userIds.map(function (userId) {
            return { _id: userId };
          });
          cb(null, users);
        } else {
          self.find({ _id: { $in: userIds } }, publicFields, domain.intercept(function (users) {
            cb(null, users);
          }));
        }
      },
      function (users, cb) {
        async.map(users, function (user, cb) {
          images.countInChannelByOwner(domain, channelId, user._id, domain.intercept(function (count) {
            user.count = count;
            cb(null, user);
          }));
        }, cb);
      }
    ], cb);
  }));
};
userSchema.methods.getVotes = function () {
  var votes = [];
  var _ref = this.votes;
  for (var _i = 0, _len = _ref.length; _i < _len; _i++) {
    var vote = _ref[_i];
    var json_vote = vote.toJSON();
    json_vote.runnable = encodeId(json_vote.runnable);
    votes.push(json_vote);
  }
  return votes;
};
userSchema.methods.addVote = function (domain, runnableId, cb) {
  var self = this;
  var found = false;
  this.votes.forEach(function (vote) {
    if (vote.runnable.toString() === runnableId.toString()) {
      found = true;
    }
  });
  if (found) {
    cb(error(403, 'cannot vote on runnable more than once'));
  } else {
    this.votes.push({ runnable: runnableId });
    this.save(domain.intercept(function () {
      var vote = self.votes[self.votes.length - 1].toJSON();
      vote.runnable = encodeId(vote.runnable);
      cb(null, vote);
    }));
  }
};
userSchema.methods.removeVote = function (domain, voteId, cb) {
  var vote = this.votes.id(voteId);
  if (!vote) {
    cb(error(404, 'vote not found'));
  } else {
    vote.remove();
    this.save(domain.intercept(function () {
      cb();
    }));
  }
};
var Users = module.exports = mongoose.model('Users', userSchema);
var plus = /\+/g;
var slash = /\//g;
var minus = /-/g;
var underscore = /_/g;
var encodeId = function (id) {
  return id;
};
var decodeId = function (id) {
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