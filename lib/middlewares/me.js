/**
 * @module lib/middlewares/me
 */
'use strict';

var flow = require('middleware-flow');
var hasKeypaths = require('101/has-keypaths');
var mw = require('dat-middleware');

var Github = require('models/apis/github');
var User = require('models/mongo/user');
var createMongooseMiddleware = require('middlewares/create-mongoose-middleware');
var error = require('error');
var logger = require('middlewares/logger')(__filename);
var transformations = require('middlewares/transformations');
var utils = require('./utils');

var replaceMeWithUserId = transformations.replaceMeWithUserId;
var Boom = mw.Boom;

module.exports = createMongooseMiddleware(User, 'sessionUser', {
  isUser: function (req, res, next) {
    flow.series(
      mw.params('userId').mapValues(replaceMeWithUserId),
      checkUserIdsMatch
    )(req, res, next);
    function checkUserIdsMatch () {
      if (!utils.equalObjectIds(req.sessionUser._id, req.params.userId)) {
        return next(error(403, 'access denied (!user)'));
      }
      next();
    }
  },
  isOwnerOf: function (modelKey) {
    return function (req, res, next) {
      logger.log.trace({
        key: modelKey,
        req: req,
        tx: true,
      }, 'isOwnerOf');
      var model = utils.replacePlaceholders(req, modelKey);
      var modelGithubId = model.owner.github;
      var userGithubId = req.sessionUser.accounts.github.id;
      if (userGithubId !== modelGithubId) {
        var token = req.sessionUser.accounts.github.accessToken;
        var github = new Github({ token: token });
        github.getUserAuthorizedOrgs(function (err, orgs) {
          if (err) { return next(err); }
          var isMember = orgs.some(hasKeypaths({
            'id.toString()': modelGithubId.toString()
          }));
          if (!isMember) {
            logger.log.error({tx: true}, 'Access denied (!owner)');
            next(Boom.forbidden('Access denied (!owner)', { githubId: modelGithubId }));
          }
          else {
            next();
          }
        });
      }
      else {
        next();
      }
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
      logger('permission' + attr),
      mw.req(userKey + '.' + attr).matches(/true/)
        .else(mw.next(Boom.forbidden('access denied (!' + attr + ')')))
    );
  }
});
