'use strict';

require('loadenv')('models/services/context-service');

var keypather = require('keypather')();
var uuid = require('uuid');

var Context = require('models/mongo/context');
var ContextVersion = require('models/mongo/context-version');

// FIXME(bryan): remove this later (when #5 is replaced w/ a service, below)
var async = require('async');
var Runnable = require('models/apis/runnable');

function ContextService () {}

module.exports = ContextService;

ContextService.handleVersionDeepCopy = function (context, contextVersion, user, cb) {
  var contextOwnerId = keypather.get(context, 'owner.github');
  var userGithubId = keypather.get(user, 'accounts.github.id');
  if (contextOwnerId === process.env.HELLO_RUNNABLE_GITHUB_ID && userGithubId !== contextOwnerId) {
    // 1. deep copy contextVersion
    ContextVersion.createDeepCopy(user, contextVersion, function (err, newContextVersion) {
      if (err) { return cb(err); }
      // 2. create new context
      var newContext = new Context({
        name: uuid(),
        owner: { github: userGithubId }
      });
      // 3. 'move' new contextVerion -> new context
      newContextVersion.context = newContext._id;

      // 4. update the owner of the contextVersion
      newContextVersion.owner.github = userGithubId;

      async.series([
        // 4.1. save context, version
        newContext.save.bind(newContext),
        newContextVersion.save.bind(newContextVersion),
        // FIXME(bryan): when we get rid of the express-request-ness of this,
        // we probably can optimize all this to a parallel action. --Kahn
        function (cb) {
          // 5. runnable.model.copyVersionIcvFiles
          var runnable = new Runnable({}, user);
          runnable.copyVersionIcvFiles(
            newContext._id,
            newContextVersion._id,
            contextVersion.infraCodeVersion,
            cb);
        }
      ], function (err, results) {
        // [1]: newContextVersion.save results
        // [1][1]: newContextVersion.save document
        cb(err, keypather.get(results, '[1][1]'));
      });
    });
  } else {
    // deep copy context version!
    ContextVersion.createDeepCopy(user, contextVersion, cb);
  }
};
