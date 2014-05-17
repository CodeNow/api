'use strict';

var bcrypt = require('bcrypt');
var configs = require('configs');
var User = require('models/users');
var containers = require('./containers');
var body = require('./body');
var params = require('./params');
var createMongooseMiddleware = require('./createMongooseMiddleware');
var error = require('error');
var utils = require('./utils');
var series = utils.series;
var reqUnlessExists = utils.reqUnlessExists;

var flow = require('middleware-flow');
var mw = require('dat-middleware');

module.exports = createMongooseMiddleware(User, {
  findMe: function (req, res, next) {
    if (!req.user_id) {
      throw new Error('NO USER_ID');
    }
    series(
      this.findById('user_id'),
      this.checkFound
    )(req, res, next);
  },
  isUser: function (req, res, next) {
    series(
      params.replaceMeWithMyId('userId'),
      checkUserIdsMatch
    )(req, res, next);
    function checkUserIdsMatch() {
      if (!utils.equalObjectIds(req.user_id, req.params.userId)) {
        return next(error(403, 'access denied (!user)'));
      }
      next();
    }
  },
  isOwnerOf: function (key) {
    return series(
      reqUnlessExists('me',
        this.findMe),
      isOwner);
    function isOwner (req, res, next) {
      var model = req[key];
      if (!model || !req.me.isOwnerOf(model)){
        return next(error(403, 'access denied (!owner)'));
      }
      next();
    }
  },
  isRegistered: function (req, res, next) {
    this.permission('registered')(req, res, next);
  },
  isVerified: function (req, res, next) {
    this.permission('isVerified')(req, res, next);
  },
  isModerator: function (req, res, next) {
    this.permission('isModerator')(req, res, next);
  },
  permission: function (attr) {
    return series(
      reqUnlessExists('me',
        this.findMe),
      this.model.unless(attr,
        utils.error(403, 'access denied (!'+attr+')'))
    );
  },
  respond: function (req, res, next) {
    var model = req.me;
    series(
      addExtra,
      this.super.respond
    )(req, res, next);
    function addExtra (req, res, next) {
      if (!model.get('gravitar')) {
        model.set('gravitar', model.toJSON()._gravitar, { strict: false });
      }
      if (req.me && req.access_token) {
        if (req.me.toJSON) {
          req.me = req.me.toJSON();
        }
        req.me.access_token = req.access_token;
      }
      if (req.me && req.me.password) {
        req.me.unset('password');
      }
      next();
    }
  },
  register: function (req, res, next) {
    series(
      body.require('email', 'username', 'password'),
      this.findConflictEmailOrUsername,
      body.pick('email', 'username', 'password'),
      registeredFields,
      this.findMe,
      this.model.set('body'),
      this.model.save()
    )(req, res, next);
    function registeredFields (req, res, next) {
      bcrypt.hash(req.body.password + configs.passwordSalt, 10,
        req.domain.intercept(function (hashedPassword) {
          req.body.password = hashedPassword;
          req.body.permission_level = 1;
          next();
        }));
    }
  },
  findConflictEmailOrUsername: function (req, res, next) {
    var query = { // used users here so not override the session user
      $or: [
        { email: req.body.email },
        { lower_username: req.body.username.toLowerCase() }
      ]
    };
    User.findOne(query, { _id:1, email:1, lower_username:1 }, req.domain.intercept(function (user) {
      if (user) {
        if (utils.equalObjectIds(user._id, req.user_id)) {
          next(400, 'already registered');
        }
        else {
          var field = (user.email === req.body.email) ? 'email' : 'username';
          next(error(409, 'user with '+field+' already exists'));
        }
      }
      else {
        next();
      }
    }));
  },
  login: function () {
    return flow.series(
      flow.or(mw.body('username').require(), mw.body('email').require()),
      mw.body('password').require(),
      mw.body('username', 'email', 'password').pick(),
      this.findOne({
        $or: [
          { email: 'body.email' },
          { username: 'body.username' },
          { username: 'body.email' }
        ]
      }),
      this.checkFound,
      this.checkUserPassword('me', 'body.password'),
      // FIXME: why the fuck is this containers line required?
      containers.authChangeUpdateOwners);
  },
  checkUserPassword: function (userKey, passwordKey) {
    return function (req, res, next) {
      var user = utils.replacePlaceholders(req, userKey);
      var password = utils.replacePlaceholders(req, passwordKey);
      user.checkPassword(password, req.domain.intercept(function (matches) {
        if (!matches) {
          return next(error(403, 'invalid password'));
        }
        next();
      }));
    };
  }
}, 'me');
