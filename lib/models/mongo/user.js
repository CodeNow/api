'use strict';

/**
 * Users are going to represent both individual users and Groups as well.
 * Groups will not be allowed to log in, however they will be owned by Users
 * @module models/user
 */

// TODO: clean this file up
var mongoose = require('mongoose');
var utils = require('middlewares/utils');
var bcrypt = require('bcrypt');
var last = require('101/last');
var isFunction = require('101/is-function');

var findIndex = require('101/find-index');
var Boom = require('dat-middleware').Boom;
var debug = require('debug')('runnable-api:user:model');
var Github = require('models/apis/github');

var UserSchema = require('models/mongo/schemas/user');

var publicFields = {
  _id: 1,
  name: 1,
  email: 1,
  created: 1,
  showEmail: 1,
  company: 1,
  accounts: 1,
  gravatar: 1
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
  delete json.password;
  cb(null, json);
};

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

// this will return an object that can be used as an owner. it will be either:
// 1) a user out of our database where the username from github query returns a github id we have
// 2) a bare object that contains the information for a github ORG represented by the username
//    AND ensures that the requesting user (sessionUser) is a memeber of that ORG
UserSchema.statics.findOneByGithubUsername = function (user, username, cb) {
  var authToken = user.accounts.github.authToken;
  var self = this;
  var github = new Github({ token: authToken });
  github.getUserByUsername(username, function (err, githubData) {
    if (err) {
      cb(err);
    }
    else if (githubData.type === 'Organization') {
      github.checkOrgMembership(githubData.login, function (err) {
        if (err) { return cb(err); }
        cb(null, { accounts: { github: githubData } });
      });
    }
    else {
      var githubId = githubData.id;
      self.findOne({ 'accounts.github.id': githubId }, cb);
    }
  });
};

UserSchema.statics.publicFindByGithubUsername = function (username, cb) {
  var self = this;
  var github = new Github();
  github.getUserByUsername(username, function (err, userData) {
    if (err) { cb(err); }
    else {
      var githubId = userData.id;
      self.publicFind({ 'accounts.github.id': githubId }, cb);
    }
  });
};

UserSchema.statics.findUsernameByGithubId = function (githubId, cb) {
  var User = this;
  User.findByGithubId(githubId, function (err, user) {
    if (err) { return cb(err); }
    var github = new Github({ token: user.accounts.github.accessToken });
    github.getAuthorizedUser(function (err, githubUser) {
      if (err) { return cb(err); }
      cb(null, githubUser.login);
    });
  });
};

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
