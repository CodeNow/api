/**
 * @module lib/middlewares/owner-is-hello-runnable
 */
'use strict';

var Boom = require('dat-middleware').Boom;
var User = require('models/mongo/user');
var createMongooseMiddleware = require('middlewares/create-mongoose-middleware');
var utils = require('middlewares/utils');
var keypather = require('keypather')();

/**
 * middleware which checks if the session user or a key on req is hello runnable
 */
module.exports = createMongooseMiddleware(User, 'sessionUser', {
  isHelloRunnable: function(modelKey) {
    return function(req, res, next) {
      var model = utils.replacePlaceholders(req, modelKey);
      var modelGithubId = keypather.get(model, 'owner.github');
      var userGithubId = req.sessionUser.accounts.github.id;
      if (modelGithubId === process.env.HELLO_RUNNABLE_GITHUB_ID) {
        next();
      } else if (userGithubId === process.env.HELLO_RUNNABLE_GITHUB_ID) {
        next();
      } else {
        next(Boom.forbidden('Access denied (!owner)', {
          githubId: modelGithubId
        }));
      }
    };
  }
}).isHelloRunnable;
