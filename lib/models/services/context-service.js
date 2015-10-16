/**
 * @module lib/models/services/context-service
 */
'use strict';

require('loadenv')('models/services/context-service');

var isFunction = require('101/is-function');
var keypather = require('keypather')();
var logger = require('middlewares/logger')(__filename).log;
var uuid = require('uuid');

var Context = require('models/mongo/context');
var ContextVersion = require('models/mongo/context-version');

// FIXME(bryan): remove this later (when #5 is replaced w/ a service, below)
var async = require('async');
var Runnable = require('models/apis/runnable');

function ContextService () {}

module.exports = ContextService;

/**
 * Handler to deal with deep copying Context Versions.
 * If it is a CV owned by HelloRunnable, it creates a new deep copy and replaces
 * the owner with the user provided (session user), creating a new context and
 * copying the infracode files as well. Otherwise, it just creates a new context
 * version.
 * @param {Object} context Context object that 'owns' the contextVersion.
 * @param {Object} contextVersion Context Version to copy.
 * @param {Object} user User object (most likely sessionUser).
 * @param {Object} [opts] Opts to allow overrides for the owner.
 * @param {Object} [opts.owner] Owner override
 * @param {Number} [opts.owner.github] Github ID of Owner with which to override.
 * @param {Function} cb Callback which returns (err, newContextVersion)
 */
ContextService.handleVersionDeepCopy = function (context, contextVersion, user, opts, cb) {
  logger.info({
    tx: true,
    contextId: context._id,
    contextVersion: contextVersion._id
  }, 'ContextService.handleVersionDeepCopy');
  if (isFunction(opts)) {
    cb = opts;
    opts = {};
  }
  var contextOwnerId = keypather.get(context, 'owner.github');
  var userGithubId = keypather.get(user, 'accounts.github.id');
  // check if the context version is (owned by hellorunnable AND the user isn't hellorunnable)
  if (contextOwnerId === process.env.HELLO_RUNNABLE_GITHUB_ID && userGithubId !== contextOwnerId) {
    // 1. deep copy contextVersion
    ContextVersion.createDeepCopy(user, contextVersion, function (err, newContextVersion) {
      if (err) { return cb(err); }
      // 2. create new context
      var ownerGithubId = keypather.get(opts, 'owner.github') || userGithubId;
      var newContext = new Context({
        name: uuid(),
        owner: { github: ownerGithubId }
      });
      // 3. 'move' new contextVerion -> new context
      newContextVersion.context = newContext._id;

      // 4. update the owner of the contextVersion
      newContextVersion.owner.github = ownerGithubId;

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
        // [1][0]: newContextVersion.save document
        // [1][1]: newContextVersion.save number affected
        cb(err, keypather.get(results, '[1][0]'));
      });
    });
  } else {
    // deep copy context version!
    ContextVersion.createDeepCopy(user, contextVersion, cb);
  }
};
