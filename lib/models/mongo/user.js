'use strict';

/**
 * Users are going to represent both individual users and Groups as well.
 * Groups will not be allowed to log in, however they will be owned by Users
 * @module models/user
 */

// TODO: clean this file up
var mongoose = require('mongoose');
var utils = require('middlewares/utils');
var encodeId = utils.encodeId;
var bcrypt = require('bcrypt');
var last = require('101/last');

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
  showEmail: 1,
  company: 1
};


UserSchema.methods.checkPassword = function (password, cb) {
  bcrypt.compare(password + process.env.PASSWORD_SALT, this.password, cb);
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

// proxy callback to delete email if not public (showEmail != true)
function proxyCallbackToProtectEmail (args) {
  var cb = last(args);
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
    if (!user.showEmail) {
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

UserSchema.statics.publicFindByUsername = function () {
  var args = Array.prototype.slice.call(arguments);
  if (typeof args[1] === 'function') {
    args[2] = args[1]; // arg1 is cb so shift and insert fields
  }
  args[1] = publicFields;
  if (args[0].username) {
    var username = args[0].username;
    args[0].$or = [
      { 'accounts.github.username': username },
      // { 'accounts.bitbucket.username': username },
    ];
    delete args[0].username;
  }
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
UserSchema.statics.findOneByUsername = function (username) {
  var args = Array.prototype.slice.call(arguments, 1);
  args.unshift({ $or: [
    { 'accounts.github.username': username },
    // { 'accounts.bitbucket.username': username },
  ]});
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
UserSchema.methods.isOwnerOf = function (model, cb) {
  // `this` is the user we are checking against.
  // if model is a group, we look in the
  var myself = this;
  if (!model) {
    cb(Boom.badImplementation('cannot check owner of nonexistant model'));
  } else {
    debug('isOwnerOf', model);
    debug('myself', myself.accounts);
    var validOwner = findIndex(Object.keys(model.owner), function (source) {
      debug('checking ' + source);
      if (myself.accounts[source]) {
        return equalToId(myself.accounts[source].id)(model.owner[source]);
      } else {
        return false;
      }
    });
    if (validOwner !== -1) {
      cb(null);
    } else {
      cb(Boom.forbidden('access denied (!owner)'));
    }
  }

  function equalToId(userId) {
    return function (modelId) {
      return utils.equalObjectIds(userId, modelId);
    };
  }
};

module.exports = mongoose.model('Users', UserSchema);
