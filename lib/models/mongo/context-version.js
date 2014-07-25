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
var User = require('models/mongo/user');
var keypather = require('keypather')();
var find = require('101/find');
var equals = require('101/equals');
var noop = require('101/noop');
var contains = function (arr, val) {
  return arr.some(equals(val));
};

var ContextVersionSchema = require('models/mongo/schemas/context-version');

ContextVersionSchema.methods.getTriggeredByUsername = function (user, cb) {
  var contextVersion = this;
  var triggeredAction = keypather.get(contextVersion, 'build.triggeredAction');
  if (!contextVersion.build.started) {
    cb(null, contextVersion); // build has not been started..
  }
  else if (triggeredAction.appCodeVersion.commit) {
    var trigger = triggeredAction.appCodeVersion;
    var github = new Github({ token: user.accounts.github.accessToken });
    github.getUsernameForCommit(trigger.repo, trigger.commit, function (err, username) {
      if (err) { return cb(err); }
      contextVersion.build.triggeredBy.username = username;
      cb(null, contextVersion);
    });
  }
  else {
    // contextVersion.build.triggeredAction.rebuild
    // contextVersion.build.triggeredAction.manual
    User.findUsernameByGithubId(contextVersion.build.triggeredBy.github, function (err, username) {
      if (err) { return cb(err); }
      contextVersion.build.triggeredBy.username = username;
      cb(null, contextVersion);
    });
  }
};

ContextVersionSchema.statics.createFirstVersion = function (props, cb) {
  var contextVersion = new ContextVersion(props);
  var infraCodeVersion = new InfraCodeVersion({
    context: props.context
  });
  infraCodeVersion.initWithDefaults(function (err) {
    if (err) { return cb(err); }
    contextVersion.infraCodeVersion = infraCodeVersion._id;
    contextVersion.save(function (err) {
      if (err) {
        infraCodeVersion.bucket().removeSourceDir(noop);
        cb(err);
      }
      else {
        infraCodeVersion.save(function (err) {
          if (err) {
            infraCodeVersion.bucket().removeSourceDir(noop);
            contextVersion.remove();
            cb(err);
          }
          else {
            cb(null, contextVersion);
          }
        });
      }
    });
  });
};

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
ContextVersionSchema.statics.findBuiltOrBuildingWithRepo = function (repo, cb) {
  var ContextVersion = this;
  ContextVersion.find({
    'build.started': { $exists: true },
    appCodeVersions: {
      $elemMatch: {
        lowerRepo: repo.toLowerCase(),
        lockCommit: false
      }
    }
  }, cb);
};

var copyFields = [
  'appCodeVersions',
  'context',
  'dockerHost',
  'owner',
  'environment'
];
ContextVersionSchema.methods.createDeepCopy = function (user, cb) {
  ContextVersion.createDeepCopy(user, this, cb);
};

ContextVersionSchema.statics.createDeepCopies = function (user, versions, cb) {
  var copies = [];
  async.map(versions, function (version, cb) {
    version.createDeepCopy(user, function (err, version) {
      if (err) {
        copies.forEach(function (version) {
          InfraCodeVersion.remove({ _id: version.infraCodeVersion });
          version.remove();
        });
        cb(err);
      }
      else {
        copies.push(version);
        cb(null, version);
      }
    });
  }, function (err, versions) {
    cb(err, versions);
  });
};

ContextVersionSchema.statics.createDeepCopy = function (user, version, cb) {
  var ContextVersion = this;
  var newVersion = new ContextVersion(pick(version, copyFields));
  newVersion.createdBy = {
    github: user.accounts.github.id
  };
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
  'appCodeVersions',
  'context',
  'owner',
  'project',
  'environment',
  'infraCodeVersion',
  'dockerHost'
];

/**
 * This function takes an array of contextVersion objects, and creates new (shallow) copies of them.
 * At least one of these contextVersions must have already been built before, otherwise this
 * function will return a bad request.
 *
 * @param contextVersions array of built context versions
 * @param cb callback
 * @returns an array of the newly created shallow copies of the input
 */
ContextVersionSchema.statics.createShallowCopies =
function (user, contextVersions, contextVersionsToUpdate, cb) {
  if (typeof contextVersionsToUpdate === 'function') {
    cb = contextVersionsToUpdate;
    contextVersionsToUpdate = null;
  }
  if (!contextVersions.every(hasProps(['build']))) {
    cb(Boom.badRequest('None of the contextVersions have been built!'));
  }
  else if (contextVersions.some(not(hasKeypaths(['build.completed'])))) {
  // If this returns any context versions, it means that some of them have their build started,
  // but hasn't finished nor errored.  We should assume that these are still building, which
  // shouldn't ever be the case.  So error.
    cb(Boom.conflict('Some of the Context Versions in the build are still building, ' +
      'but they should all be done.'));
  }
  else {
    // Now we need to create copies for each contextVersion and save them into the database.
    async.map(contextVersions, function (version, cb) {
      if (!contextVersionsToUpdate || contains(contextVersionsToUpdate, version._id.toString())) {
        ContextVersion.createShallowCopy(user, version, cb);
      }
      else {
        cb(null, version);
      }
    }, cb);
  }
};

/**
 * This creates a copy of the input Context Version object, but doesn't create copies of any of the
 * member objects.  It then sets the createdBy to the userId input object.  If the context version
 * doesn't have an infraCodeVersionId, this function will throw an error.
 * @param version ContextVersion to be copied
 * @param userId User object of the current user who triggered this event
 * @param cb callback
 */
ContextVersionSchema.statics.createShallowCopy = function (user, version, cb) {
  this.newShallowCopy(user, version, function (err, newVersion) {
    if (err) { return cb(err); }
    newVersion.save(cb);
  });
};

ContextVersionSchema.statics.newShallowCopy = function (user, version, cb) {
  var createdBy = {
    github: user.accounts.github.id
  };
  var newVersion = new ContextVersion(pick(version, shallowCopyFields));
  newVersion.createdBy = createdBy;
  if (!version.infraCodeVersion) {
    cb(Boom.badImplementation('version is missing infraCodeVersion'));
  } else {
    cb(null, newVersion);
  }
};

/**
 * This function is used to not only set the started Date on the current ContextVersion object,
 * but it throws an error if started has already been called previous to this iteration
 * @param user user object of the current user
 * @param cb callback
 */
ContextVersionSchema.methods.setBuildStarted = function (user, dockerHost, buildProps, cb) {
  if (typeof buildProps === 'function') {
    cb = buildProps;
    buildProps = {};
  }
  var update = {};
  update.$set = {
    'dockerHost': dockerHost,
    'build.started' : Date.now(),
    'build.triggeredBy.github': user.accounts.github.id
  };
  Object.keys(buildProps).forEach(function (key) {
    update.$set['build.'+key] = buildProps[key];
  });

  var contextVersion = this;
  var query;

  if (buildProps.triggeredAction.appCodeVersion) {
    query = {
      _id: contextVersion._id,
      'build.started': {
        $exists: false
      },
      'appCodeVersions.lowerRepo': buildProps.triggeredAction.appCodeVersion.repo.toLowerCase()
    };
    update.$set['appCodeVersions.$.commit'] = buildProps.triggeredAction.appCodeVersion.commit;
  }
  else {
    query = {
      _id: contextVersion._id,
      'build.started': {
        $exists: false
      }
    };
  }
  ContextVersion.findOneAndUpdate(query, update,
    function(err, updatedContextVersion) {
      if (err) {
        cb(err);
      } else if (!updatedContextVersion) {
        cb(Boom.conflict('Context version build is already in progress.', {
          debug: {
            contextVersion : contextVersion._id
          }
        }));
      } else {
        var appCodesWithoutCommit =
          updatedContextVersion.appCodeVersions.filter(not(hasProps(['commit'])));
        async.forEach(appCodesWithoutCommit, getAndSaveLatestCommit, function (err) {
          cb(err, updatedContextVersion);
        });
      }
    });
  function getAndSaveLatestCommit (appCodeVersion, cb) {
    var github = new Github({ token: user.accounts.github.authToken });
    github.getLatestCommit(appCodeVersion.repo, appCodeVersion.branch,
      function (err, commit) {
        if (err) { return cb(err); }
        cb(null, commit.committer.login);
      });
  }
};

ContextVersionSchema.methods.setBuildCompleted = function (dockerInfo, cb) {
  var contextVersion = this;
  if (!dockerInfo.dockerTag) {
    cb(Boom.badRequest('ContextVersion requires dockerTag'));
  }
  else if (!dockerInfo.dockerImage) {
    cb(Boom.badRequest('ContextVersion requires dockerImage'));
  }
  else {
    ContextVersion.findOneAndUpdate({
      _id: contextVersion._id,
      'build.started': {
        $exists: true
      },
      'build.completed': {
        $exists: false
      }
    }, {
      $set: {
        'build.completed' : Date.now(),
        'build.dockerTag': dockerInfo.dockerTag,
        'build.dockerImage': dockerInfo.dockerImage,
      }
    }, function(err, updatedContextVersion) {
      if (err) {
        cb(err);
      } else if (!updatedContextVersion) {
        var message = contextVersion.build.started ?
          'Context version build is already built.' :
          'Context version build has not started.';
        cb(Boom.badRequest(message, {
          debug: {
            contextVersion : contextVersion._id
          }
        }));
      } else {
        cb(null, updatedContextVersion);
      }
    });
  }
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

ContextVersionSchema.methods.addGithubRepo = function (user, repoInfo, cb) {
  var githubToken = user.accounts.github.accessToken;
  debug('usertoken', githubToken);
  var container = this;
  var github = new Github({ token: githubToken });

  async.waterfall([
    github.createRepoHookIfNotAlready.bind(github, repoInfo.repo),
    function (hook, cb) {
      if (typeof hook === 'function') {
        cb = hook;
      }
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

ContextVersionSchema.methods.pullAppCodeVersion = function (appCodeVersionId, cb) {
  debug('_pushAppCodeVersion');
  var contextVersion = this;

  var found =
    find(contextVersion.appCodeVersions, hasKeypaths({
      '_id.toString()': appCodeVersionId.toString()
    }));
  if (!found) {
    cb(Boom.notFound('AppCodeVersion with _id "'+appCodeVersionId+'" not found'));
  }
  else {
    contextVersion.update({
      $pull: {
        appCodeVersions: {
          _id: appCodeVersionId
        }
      }
    }, cb);
  }
};

var ContextVersion = module.exports = mongoose.model('ContextVersions', ContextVersionSchema);
