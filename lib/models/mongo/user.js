/**
 * @module lib/models/mongo/user
 */
'use strict';

/**
 * Users are going to represent both individual users and Groups as well.
 * Groups will not be allowed to log in, however they will be owned by Users
 * @module models/mongo/user
 */

// TODO: clean this file up
var findIndex = require('101/find-index');
var hasProps = require('101/has-properties');
var last = require('101/last');
var mongoose = require('mongoose');

var Github = require('models/apis/github');
var UserSchema = require('models/mongo/schemas/user');
var logger = require('middlewares/logger')(__filename);

var Users;
var log = logger.log;

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

UserSchema.statics.publicFindByGithubUsername = function (username, cb) {
  log.trace({
    tx: true,
    username: username
  }, 'publicFindByGithubUsername');
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

/**
 * Find github user by id
 * @param {String} githubId
 * @param {Function} cb
 */
UserSchema.methods.findGithubUserByGithubId = function (githubId, cb) {
  var github = new Github({ token: this.accounts.github.accessToken });
  github.getUserById(githubId, cb);
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
  log.trace({
    id: id,
    tx: true
  }, 'findByGithubId');
  var args = Array.prototype.slice.call(arguments, 1);
  if (typeof id !== 'number') {
    id = Number(id);
  }
  args.unshift({ 'accounts.github.id': id });
  this.findOne.apply(this, args);
};

UserSchema.statics.updateByGithubId = function (id) {
  var args = Array.prototype.slice.call(arguments, 1);
  args.unshift({ 'accounts.github.id': id });
  this.update.apply(this, args);
};
/**
 * create mapping between hostname and instance to route to
 * @param  {string}   srcHostname    hostname which needs to be routed
 * @param  {string}   destInstanceId instance to route to
 * @param  {Function} cb          (err)
 */
UserSchema.methods.mapRoute = function (srcHostname, destInstanceId, cb) {
  var i = findIndex(this.routes, hasProps({ srcHostname: srcHostname }));
  if (~i) {
    // update if found
    this.routes[i] = {
      srcHostname: srcHostname,
      destInstanceId: destInstanceId
    };
  } else {
    // if not found just add
    this.routes.push({
      srcHostname: srcHostname,
      destInstanceId: destInstanceId
    });
  }

  Users.findByIdAndUpdate({
    _id: this._id
  }, {
    routes: this.routes
  }, cb);
};
/**
 * remove mapping from hostname
 * @param  {string}   srcHostname hostname to remove mapping from
 * @param  {Function} cb          (err)
 */
UserSchema.methods.removeRoute = function (srcHostname, cb) {
  Users.findByIdAndUpdate({
    _id: this._id
  }, {
    $pull: {
      routes: {
        srcHostname: srcHostname
      }
    }
  }, cb);
};

Users = module.exports = mongoose.model('Users', UserSchema);
