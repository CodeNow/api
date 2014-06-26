'use strict';

var User = require('models/mongo/user');
var createMongooseMiddleware = require('middlewares/mongo/create-mongoose-middleware');
var error = require('error');
var utils = require('./utils');
var flow = require('middleware-flow');
var mw = require('dat-middleware');
var transformations = require('middlewares/transformations');
var replaceMeWithUserId = transformations.replaceMeWithUserId;
var Boom = mw.Boom;

module.exports = createMongooseMiddleware(User, {
  isUser: function (req, res, next) {
    flow.series(
      mw.params('userId').mapValues(replaceMeWithUserId),
      checkUserIdsMatch
    )(req, res, next);
    function checkUserIdsMatch() {
      if (!utils.equalObjectIds(req.sessionUser._id, req.params.userId)) {
        return next(error(403, 'access denied (!user)'));
      }
      next();
    }
  },
  isOwnerOf: function (key) {
    var userKey = this.key;
    return function (req, res, next) {
      var user = req[userKey];
      var model = req[key];
      user.isOwnerOf(model, next);
    };
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
    var userKey = this.key;
    return flow.series(
      mw.req(userKey+'.'+attr).matches(/true/)
        .else(mw.next(Boom.forbidden('access denied (!'+attr+')')))
    );
  }
}, 'sessionUser');
