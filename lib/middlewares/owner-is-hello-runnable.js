'use strict';

var Boom = require('dat-middleware').Boom;
var User = require('models/mongo/user');
var createMongooseMiddleware = require('middlewares/create-mongoose-middleware');
var keypather = require('keypather')();

module.exports = createMongooseMiddleware(User, 'sessionUser', {
  isHelloRunnable: function (modelKey) {
    return function (req, res, next) {
      var model = keypather.get(req, modelKey);
      var modelGithubId = model.owner.github;
      var userGithubId = req.sessionUser.accounts.github.id;
      if (modelGithubId === process.env.HELLO_RUNNABLE_GITHUB_ID) {
        next();
      }
      else if (userGithubId === process.env.HELLO_RUNNABLE_GITHUB_ID) {
        next();
      }
      else {
        next(Boom.forbidden('Access denied (!owner)', { githubId: modelGithubId }));
      }
    };
  }
}).isHelloRunnable;
