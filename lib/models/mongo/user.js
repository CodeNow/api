'use strict';

/**
 * Users are going to represent both individual users and Groups as well.
 * Groups will not be allowed to log in, however they will be owned by Users
 * @module models/user
 */

// TODO: clean this file up

var _ = require('lodash');
var async = require('async');
var configs = require('configs');
var mongoose = require('mongoose');
var utils = require('middlewares/utils');
var encodeId = utils.encodeId;
var bcrypt = require('bcrypt');
var error = require('error');

var findIndex = require('101/find-index');
var Boom = require('dat-middleware').Boom;
var debug = require('debug')('runnable-api:user:model');

var UserSchema = require('models/mongo/schemas/user');

var publicFields = {
  _id: 1,
  username: 1,
  name: 1,
  email: 1,
  created: 1,
  show_email: 1,
  company: 1
};


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
  args.unshift({ lowerUsername: username.toLowerCase() });
  this.findOne.apply(this, args);
};
UserSchema.statics.findByGithubId = function (id) {
  var args = Array.prototype.slice.call(arguments, 1);
  args.unshift({ 'accounts.github.id': id });
  this.findOne.apply(this, args);
};
UserSchema.statics.updateByGithubId = function (id) {
  var args = Array.prototype.slice.call(arguments, 1);
  args.unshift({ 'accounts.github.id': id });
  this.update.apply(this, args);
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
  if (!model) {
    cb(Boom.badImplementation('cannot check owner of nonexistant model'));
  }
  else if (model.isGroup && checkGroupOwners(this._id, model.groupOwners)) {
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
