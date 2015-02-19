'use strict';

/**
 * Users are going to represent both individual users and Groups as well.
 * Groups will not be allowed to log in, however they will be owned by Users
 * @module models/user
 */

// TODO: clean this file up
var mongoose = require('mongoose');
var last = require('101/last');
var isFunction = require('101/is-function');
var hasProps = require('101/has-properties');
var find = require('101/find');

// var debug = require('debug')('runnable-api:user:model');
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

// this will return an object that can be used as an owner. it will be either:
// 1) a user out of our database where the username from github query returns a github id we have
// 2) a bare object that contains the information for a github ORG represented by the username
UserSchema.statics.findOneByGithubUsername = function (username, sessionUserAccessToken, cb) {
  if (isFunction(sessionUserAccessToken)) {
    cb = sessionUserAccessToken;
    sessionUserAccessToken = undefined;
  }
  var self = this;
  var github = new Github({token: sessionUserAccessToken});
  github.getUserByUsername(username, function (err, githubData) {
    if (err) { cb(err); }
    else {
      var githubId = githubData.id;
      if (githubData.type === 'Organization') {
        cb(null, { accounts: { github: githubData } });
      } else {
        self.findOne({ 'accounts.github.id': githubId }, cb);
      }
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

UserSchema.statics.publicFindOneByGithubUsername = function (username, cb) {
  var self = this;
  var github = new Github();
  github.getUserByUsername(username, function (err, userData) {
    if (err) { cb(err); }
    else {
      var githubId = userData.id;
      self.publicFindOne({ 'accounts.github.id': githubId }, cb);
    }
  });
};

UserSchema.methods.findGithubUserByGithubId = function (githubId, cb) {
  var User = this;
  Users.findByGithubId(githubId, function (err, user) {
    if (err) {
      return cb(err);
    } else if (!user) {
      User.findGithubOrgByGithubId(githubId, cb);
    } else {
      // FIXME: we should not be making requests with another user's token....
      var github = new Github({ token: user.accounts.github.accessToken });
      github.getAuthorizedUser(function (err, githubUser) {
        if (err) { return cb(err); }
        cb(null, githubUser);
      });
    }
  });
};

UserSchema.methods.findGithubOrgByGithubId = function (githubOrgId, cb) {
  var User = this;
  var github = new Github({ token: User.accounts.github.accessToken });
  github.getUserAuthorizedOrgs(function (err, orgs) {
    if (err) { return cb(err); }
    var org = find(orgs, hasProps({id: githubOrgId}));
    if (org) { org.type = 'Organization'; }
    cb(null, org);
  });
};

UserSchema.statics.addSlackAccount = function (userId, account, cb) {
  this.update({
    _id: userId,
    'accounts.slack.orgs.githubId': {$ne: account.githubId}},
    {$push: {'accounts.slack.orgs': account}}, cb);
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

var Users = module.exports = mongoose.model('Users', UserSchema);
