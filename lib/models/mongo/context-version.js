'use strict';

/**
 * Versions of a Context!
 * @module models/version
 */

var isFunction = require('101/is-function');
var Boom = require('dat-middleware').Boom;
var pick = require('101/pick');
var async = require('async');
var InfraCodeVersion = require('models/mongo/infra-code-version');
var mongoose = require('mongoose');
var Github = require('models/apis/github');
var debug = require('debug')('runnable-api:context-version:model');
var not = require('101/not');
var hasProps = require('101/has-properties');
var hasKeypaths = require('101/has-keypaths');

var ContextVersionSchema = require('models/mongo/schemas/context-version');

/** Create a version for a context */
ContextVersionSchema.statics.createForContext = function (context, props, cb) {
  var ContextVersion = this;
  if (isFunction(props)) {
    cb = props;
    props = null;
  }
  props = props || {};
  var version = new ContextVersion({
    context: context._id,
    createdBy: context.owner,
    owner: context.owner
  });
  version.set(props);
  cb(null, version);
};

/** Copy a version to a new version! - user must be owner of old
 *  @params {object} body
 *  @params {ObjectId} body.versionId Version ID to copy from
 *  @params {ObjectId} ownerId Owner of the newly created version
 *  @params {function} callback
 *  @returns {object} New Version */
ContextVersionSchema.statics.findWithRepository = function (ownerName, repoName, cb) {
  var ContextVersion = this;
  var lowerRepo = (ownerName+'/'+repoName).toLowerCase();
  ContextVersion.find({
    'appCodeVersions.lowerRepo': lowerRepo
  }, cb);
};

var copyFields = [
  'appCodeVersion',
  'context',
  'owner',
  'dockerHost'
];
ContextVersionSchema.statics.createCopy = function (createdBy, version, cb) {
  version.createCopy(createdBy, cb);
};

ContextVersionSchema.statics.createDeepCopy = function (version, userId, cb) {
  var ContextVersion = this;
  var newVersion = new ContextVersion(pick(version, copyFields));
  newVersion.createdBy = createdBy;
  if (!version.infraCodeVersion) {
    cb(Boom.badImplementation('version is missing infraCodeVersion'));
  }
  else {
    InfraCodeVersion.createCopyById(version.infraCodeVersion, function (err, newInfraCodeVersion) {
      if (err) { return cb(err); }

      newVersion.infraCodeVersion = newInfraCodeVersion._id;
      newVersion.save(function (err, version) {
        if (err) {
          newInfraCodeVersion.remove(); // remove error handled below
        }
        cb(err, version);
      });
    });
  }
};
var shallowCopyFields = [
  'appCodeVersion',
  'context',
  'owner',
  'environment',
  'infracodeVersion',
  'dockerHost'
];

/**
 *
 * @param contextVersions
 * @param cb
 * @returns {*}
 */
ContextVersionSchema.statics.createNewCopies = function (contextVersions, cb) {
  var oldContextVersions = contextVersions.filter(hasProps(['build']));
  if (oldContextVersions.length === 0) {
    return next(Boom.badRequest('None of the contextVersions have been built!'));
  }
  // If this returns any context versions, it means that some of them have their build started,
  // but hasn't finished nor errored.  We should assume that these are still building, which
  // shouldn't ever be the case.  So error.
  if (oldContextVersions.filter(not(hasKeypaths(['build.error', 'build.completed']))).length > 0) {
    return next(Boom.badRequest('Some of the Context Versions in the build are still building, ' +
      'but they should all be done.'));
  }
  // Now we need to create copies for each contextVersion and save them into the database.

  async.map(oldContextVersions, function(version, cb) {
    ContextVersion.createShallowCopy(version, 'sessionUser._id', cb)
  }, cb);
};

ContextVersionSchema.statics.createShallowCopy = function (version, userId, cb) {
  var ContextVersion = this;
  var newVersion = new ContextVersion(pick(version, shallowCopyFields));
  newVersion.createdBy = userId;
  if (!version.infraCodeVersion) {
    cb(Boom.badImplementation('version is missing infraCodeVersion'));
  } else {
    version.save(cb);
  }
};

ContextVersionSchema.methods.setStarted = function (user, cb) {
  var contextVersion = this;
  ContextVersion.findOneAndUpdate({
    _id: contextVersion._id,
    'build.started': {
      $exists: false
    }
  }, {
    $set: {
      'build.started' : Date.now(),
      'build.triggeredBy.user.github': user.accounts.github.id
    }
  }, function(err, updatedContextVersion) {
    if (err) {
      cb(err);
    } else if (!updatedContextVersion) {
      cb(Boom.badRequest('Context version build is already in progress.', {
        debug: {
          contextVersion : contextVersion._id
        }
      }));
    } else {
      cb(null, updatedContextVersion);
    }
  });
};

ContextVersionSchema.methods.updateBuildError = function (err, cb) {
  var contextVersion = this;
  contextVersion.update({
    $set: {
      'build.error.message': err.message,
      'build.error.stack': err.stack
    }
  }, cb);
};

ContextVersionSchema.methods.addGithubRepo = function (githubToken, repoInfo, cb) {
  debug('usertoken', githubToken);
  var container = this;
  var github = new Github({ token: githubToken });

  async.waterfall([
    github.createRepoHookIfNotAlready.bind(github, repoInfo.repo),
    function (hook, cb) {
      container._pushAppCodeVersion(repoInfo, cb);
    }
  ], cb);
};

ContextVersionSchema.methods._pushAppCodeVersion = function (appCodeVersion, cb) {
  debug('_pushAppCodeVersion');
  var contextVersion = this;

  if (appCodeVersion.commit) {
    appCodeVersion.lockCommit = true;
  }
  contextVersion.appCodeVersions.push(appCodeVersion);
  var appCodeVersionModel = contextVersion.appCodeVersions.pop();

  contextVersion.update({
    $push: {
      appCodeVersions: appCodeVersionModel
    }
  }, function (err) {
    if (err) { return cb(err); }
    ContextVersion.findById(contextVersion._id, cb);
  });
};

var ContextVersion = module.exports = mongoose.model('ContextVersions', ContextVersionSchema);
