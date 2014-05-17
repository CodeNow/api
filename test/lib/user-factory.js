var isFunction = require('101/is-function');
var Runnable = require('runnable');
var host = require('./host');
var uuid = require('uuid');
var User = require('models/users');

module.exports = {
  createTokenless: function () {
    if (arguments.length) {
      throw new TypeError('createTokenless is sync (no cb)');
    }
    return new Runnable(host);
  },
  createAnonymous: function (cb) {
    var user = this.createTokenless();
    user.anonymous(cb);
    return user;
  },
  createRegistered: function (email, username, password, cb) {
    if (isFunction(email)) {
      cb = email;
      email = null;
      username = null;
      password = null;
    }
    else if (isFunction(username)) {
      cb = username;
      username = null;
      password = null;
    }
    else if (isFunction(password)) {
      cb = password;
      password = null;
    }
    email = email || uuid()+'@domain.com';
    username = username || uuid();
    password = password || uuid();
    var user =  this.createTokenless();
    user.register(email, username, password, cb);
    return user;
  },
  createAdmin: function (email, username, password, cb) {
    var user = this.createRegistered(email, username, password, function (err, user) {
      if (err) {
        cb(err);
      }
      else {
        var $set = {
          permission_level: 5
        };
        User.updateById({ _id: user._id }, { $set: $set }, callbackData(user, cb));
      }
    });
    return user;
  }
};

function callbackData (data, cb) {
  return function (err) {
    if (err) {
      cb(err);
    }
    else {
      cb(null, data);
    }
  };
}