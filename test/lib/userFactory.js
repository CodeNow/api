var _ = require('lodash');
var async = require('async');
var db = require('./db');
var helpers = require('./helpers');
var TestUser = require('./TestUser');

function callbackUser (cb) {
  return function (err, res) {
    if (err) {
      return cb(err);
    }
    var user = new TestUser(res.body);
    cb(null, user);
  };
}

function createUsername (suggestedUsername, ignoreConflictError, cb) {
  if (typeof ignoreConflictError === 'function') {
    cb = ignoreConflictError;
    ignoreConflictError = true; //default ignore
  }
  db.users.distinct('username', {}, function (err, usernames) {
    if (err) {
      return cb(err);
    }
    while (~usernames.indexOf(suggestedUsername)) {
      suggestedUsername = suggestedUsername + (Math.random() * 100);
    }
    cb(null, suggestedUsername);
  });
}


var users = module.exports = {
  createTokenless: function (callback) {
    callback(null, new TestUser());
  },
  createAnonymous: function (callback) {
    helpers.request.post('/users')
      .expect(201)
      .expectBody('access_token')
      .expectBody('_id')
      .end(callbackUser(callback));
  },
  createRegistered: function (properties, callback) {
    var authKeys = ['username', 'password', 'email'];
    var auth = _.pick(properties, authKeys);
    var ignoreConflictError = !Boolean(auth.username);
    createUsername('registered' || auth.username, ignoreConflictError, function (err, username) {
      if (err) {
        return callback(err);
      }
      var body = {
        username: username,
        password: 'password',
        email   : username+'@runnable.com'
      };
      _.extend(body, auth);
      async.waterfall([
        users.createAnonymous,
        function (user, cb) {
          user.register(body).end(function (err) {
            cb(err, user);
          });
        },
        function (user, cb) {
          var customProperties = _.omit(properties, authKeys);
          if (_.isEmpty(customProperties)) {
            return cb(null, user);
          }
          user.dbUpdate(customProperties, function (err) {
            cb(err, user);
          });
        }
      ], callback);
    });
  },
  createPublisher: function (properties, callback) {
    if (typeof properties === 'function') {
      // function (callback)
      callback = properties;
      properties = {};
    }
    properties = _.extend(properties || {}, {permission_level:3});
    users.createRegistered(properties, callback);
  },
  createAdmin: function (properties, callback) {
    if (typeof properties === 'function') {
      // function (callback)
      callback = properties;
      properties = {};
    }
    properties = _.extend(properties || {}, {permission_level:5});
    users.createRegistered(properties, callback);
  },
  createUserByType: function (userType, properties, callback) {
    if (typeof properties === 'function') {
      callback = properties;
      properties = {};
    }
    var method = 'create' + helpers.capitalize(userType);
    var args = [];
    if (userType.toLowerCase() !== 'anonymous') {
      args.push(properties);
    }
    args.push(callback);
    users[method].apply(users, args);
  }
};
