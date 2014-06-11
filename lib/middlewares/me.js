'use strict';

var bcrypt = require('bcrypt');
var configs = require('configs');
var User = require('models/mongo/user');
var createMongooseMiddleware = require('middlewares/mongo/create-mongoose-middleware');
var error = require('error');
var utils = require('./utils');
var flow = require('middleware-flow');
var series = flow.series;
var reqUnlessExists = utils.reqUnlessExists;
var mw = require('dat-middleware');
var transformations = require('middlewares/transformations');
var replaceMeWithUserId = transformations.replaceMeWithUserId;
var Boom = mw.Boom;

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
      mw.params('userId').mapValues(replaceMeWithUserId),
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
      if (!model) { return next(Boom.forbidden('access denied (!model)')); }
      req.me.isOwnerOf(model, next);
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
      mw.req('me').require().else(this.findMe),
      mw.req('me.'+attr).matches(/true/)
        .else(mw.next(Boom.forbidden('access denied (!'+attr+')')))
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
        if (req.me.set) {
          req.me.set('access_token', req.access_token, { strict: false });
        }
        else {
          req.me.access_token = req.access_token;
        }
      }
      if (req.me.returnJSON) {
        req.me.returnJSON(function (err, me) {
          if (err) {
            next(err);
          }
          else {
            req.me = me;
            next();
          }
        });
      }
      else {
        next();
      }
    }
  },
  register: function (req, res, next) {
    series(
      mw.body('email', 'username', 'password').pick().require(),
      this.findConflictEmailOrUsername,
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
    return series(
      mw.body('username', 'email', 'password').pick(),
      mw.body({ or: ['username', 'email'] }).require(),
      mw.body('password').require(),
      this.findOne({
        $or: [
          { email: 'body.email' },
          { username: 'body.username' },
          { username: 'body.email' }
        ],
        isGroup: false
      }),
      this.checkFound,
      this.checkUserPassword('me', 'body.password'));
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
