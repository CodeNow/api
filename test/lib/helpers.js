var coffee = require('coffee-script');
var async = require('async');
var mongoose = require('mongoose');
var configs = require('../../lib/configs');
var st = require('supertest');
var httpMethods = require('methods');
var _ = require('lodash')
var db = {};
mongoose.connection.once('connected', function() {
  _.extend(db, _.pick(mongoose.connection.collections, 'users'))
});

var getRequestArr = function(test) {
  var found, spec;
  spec = test.runnable();
  while (spec.parent.parent) {
    spec = spec.parent;
    found = httpMethods.some(function(method) {
      var re = new RegExp('^' + method.toUpperCase() + ' \/[^ ]*$');
      return spec.title.match(re);
    });
    if (found) break;
  }
  return spec.title.split(' ');
};
var createUsername = function (suggestedUsername, ignoreConflictError, cb) {
  if (typeof ignoreConflictError === 'function') {
    cb = ignoreConflictError;
    ignoreConflictError = true; //default ignore
  }
  db.users.distinct('username', {}, function (err, usernames) {
    if (err) return cb(err);
    while (~usernames.indexOf(suggestedUsername)) {
      suggestedUsername = suggestedUsername + (Math.random() * 100);
    }
    cb(null, suggestedUsername);
  });
}
var modifyRequest = function(request) {
  // wrap .body
  var origbody = request.body;
  request.body = function () {
    request.set('Content-Type', 'application/json');
    origbody.call(request, arguments);
  };
  // wrap .end
  var origend = request.end;
  request.end = function(fn) {
    origend.call(request, function(err, res) {
      if (err) {
        console.error('\n', res.body);
      }
      fn(err, res);
    });
  };
};

module.exports = helpers = {
  createServer: function() {
    var server = new (require('../../lib/index'));
    return server.create();
  },
  createAnonymousUser: function (cb) {
    helpers.request('POST', '/users')
      .expect(201)
      .end(function (err, res) {
        if (err) return cb(err);
        res.body.should.have.property('access_token');
        res.body.should.have.property('_id');
        cb(null, res.body, res.body.access_token);
      });
  },
  createRegisteredUser: function (auth, cb) {
    var ignoreConflictError = !Boolean(auth.username);
    createUsername('registered' || auth.username, ignoreConflictError, function (err, username) {
      if (err) return cb(err);
      var body = {
        username: username,
        password: 'password',
        email   : username+'@runnable.com'
      };
      _.extend(body, auth);
      helpers.createAnonymousUser(function (err, body, token) {
        if (err) return cb(err);
        helpers.request('PUT', '/users/me', token)
          .send(JSON.stringify(body))
          .expect(201)
          .end(function (err, res) {
            console.log(err, res)
            if (err) return cb(err);
            res.body.should.have.property('_id');
            cb(null, res.body, res.body.access_token);
          });
      });
    });
  },
  createCustomUser: function (properties, cb) {
    var auth = _.pick(properties, 'username', 'password', 'email');
    helpers.createRegisteredUser(auth, function (err, user, token) {
      if (err) return cb(err);
      var query = {_id:req.body._id};
      var update = { $set:properties };
      db.users.update(query, update, function (err, success) {
        if (err) return cb(err);
        if (success === 0) return cb(new Error('custom user properties were not updated'))
        cb(null, user, token);
      });
    });
  },
  createPublisherUser: function () {
    helpers.createCustomUser({permission_level:3});
  },
  createAdminUser: function () {
    helpers.createCustomUser({permission_level:5});
  },
  request: function (method, urlPath, token) {
    var app = helpers.createServer();
    var request = st(app)[method.toLowerCase()](urlPath);
    if (token) request.set('runnable-token', token);
    modifyRequest(request);
    return request;
  },
  setupRegUserRequest: function (properties) {
    return function () {
      var context = this;
      helpers.createCustomUser
    };
  },
  setupAnonRequest: function (done) {
    helpers.setupUserAndRequest('anonymous').call(this, done);
  },
  setupUserAndRequest: function (userType, options) {
    return function (done) {
      var context = this;
      function callback (err, body, token) {
        if (err) return done(err);
        context.token = token;
        helpers.setupRequest.call(context);
        done();
      }
      options = options || {};
      userType = userType.toLowerCase();
      if (userType === 'anonymous') {
        helpers.createAnonymousUser(callback);
      }
      else if (userType === 'registered') {
        helpers.createRegisteredUser(options, callback);
      }
      else if (userType === 'publisher') {
        helpers.createPublisherUser(options, callback);
      }
      else if (userType === 'admin') {
        helpers.createAdminUser(options, callback);
      }
    }
  },
  setupRequest: function () {
    var context = this;
    var requestArr = getRequestArr(context);
    var method      = requestArr[0].toLowerCase();
    var methodUpper = requestArr[0].toUpperCase();
    var urlPath     = requestArr[1];

    context.request = function () {
      return helpers.request(method, urlPath, context.token);
    };
  },
  dropCollections: function(callback) {
    var collections;
    console.log('    drop db collections');
    callback = callback || function() {};
    collections = Object.keys(mongoose.connection.collections);
    async.forEach(collections, function(collectionName, done) {
      var collection;
      collection = mongoose.connection.collections[collectionName];
      collection.drop(function(err) {
        if (err && err.message !== 'ns not found') {
          done(err);
        } else {
          done();
        }
      });
    }, callback);
  },
  dropDatabase: function() {
    console.log('  drop db');
    mongoose.connection.db.dropDatabase();
  }
};

// BEFORE ALL

// AFTER ALL
process.on('exit', helpers.dropDatabase);
