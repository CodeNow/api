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
var keypather = require('keypather')();
var find = require('101/find');
var equals = require('101/equals');
var noop = require('101/noop');
var createCount = require('callback-count');
var dogstatsd = require('models/datadog');
var error = require('error');

/**
 * d1 >= d2
 * @param  {Date} d1 date1
 * @param  {Date} d2 date2
 * @return {Boolean}    d1 >= d2
 */
var dateGTE = function (d1, d2) {
  return (d1 - d2) >= 0;
};
var dateLTE = function (d1, d2) {
  return (d1 - d2) <= 0;
};
var contains = function (arr, val) {
  return arr.some(equals(val));
};
var addAppCodeVersionQuery = function (contextVersion, query) {
  if (contextVersion.appCodeVersions.length) {
    query.$and = contextVersion.appCodeVersions.map(function (acv) {
      return {
        appCodeVersions: {
          $elemMatch: {
            lowerRepo: acv.lowerRepo,
            commit: acv.commit
          }
        }
      };
    });
    query.$and.push({appCodeVersions: { $size: contextVersion.appCodeVersions.length }});
  } else {
    query.appCodeVersions = { $size: 0 };
  }
  return query;
};

var ContextVersionSchema = require('models/mongo/schemas/context-version');


ContextVersionSchema.methods.getTriggeredByUsername = function (user, cb) {
  var contextVersion = this;
  var triggeredAction = keypather.get(contextVersion, 'build.triggeredAction');
  if (!contextVersion.build.started) {
    cb(null, contextVersion); // build has not been started..
  }
  // We're assuming here that a CV must have at least commit hash, or a user to be triggeredBy.
  // If commit is false, (and the triggeredBy is empty), something went wrong.
  else if (triggeredAction.appCodeVersion.commit) {
    var trigger = triggeredAction.appCodeVersion;
    var github = new Github({ token: user.accounts.github.accessToken });
    var count = createCount(2, done);
    github.getUserForCommit(
      trigger.repo, trigger.commit, extendWithGithubUserFields(count.next));
    getLatestCommitInfo(triggeredAction, count.next);
  }
  else if (contextVersion.build.triggeredBy){
    // contextVersion.build.triggeredAction.rebuild
    // contextVersion.build.triggeredAction.manual
    user.findGithubUserByGithubId(
      contextVersion.build.triggeredBy.github, extendWithGithubUserFields(cb));
  } else {
    // Error to rollbar
    return cb(Boom.internal('The fetched context version wasn\'t updated by a githook, nor ' +
      'does it contain the triggerer info', {
      debug: {
        id: contextVersion._id,
        contextVersion: contextVersion
      }
    }));
  }
  function getLatestCommitInfo (triggeredAction, cb) {
    async.map(triggeredAction.appCodeVersion.commitLog,
      function (commit, cb) {
        github.getCommit(trigger.repo, commit.id, function (err, commit) {
          if (err) { return cb(err); }
          commit.committer.username = commit.committer.login;
          commit.committer.gravatar = getGravatarUrl(commit.committer);
          cb(null, commit);
        });
      },
      function (err, commits) {
        triggeredAction.appCodeVersion.commitLog = commits;
        cb(err);
      });
  }
  function extendWithGithubUserFields (cb) {
    return function (err, githubUser) {
      if (err) { return cb(err); }
      contextVersion.build.triggeredBy.username = githubUser.login;
      contextVersion.build.triggeredBy.gravatar = getGravatarUrl(githubUser);
      cb(null, contextVersion);
    };
  }
  function getGravatarUrl (githubUser) {
    return githubUser.avatar_url || 'https://gravatar.com/avatar/' + githubUser.gravatar_id;
  }
  function done (err) {
    cb(err, contextVersion);
  }
};

ContextVersionSchema.statics.createWithNewInfraCode = function (props, cb) {
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

var copyFields = [
  'appCodeVersions',
  'context',
  'owner'
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
    InfraCodeVersion.createCopyById(version.infraCodeVersion,
      function (err, newInfraCodeVersion) {
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
    else if (contextVersions.some(not(hasKeypaths(['build.started'])))) {
      // If this returns any context versions, it means that some of them have their build started,
      // which ensures that the build files are locked down.
      // If this is not the case, we cannot use it
      cb(Boom.conflict('Some of the Context Versions in the build have not been started. Build ' +
        'files are not locked down. Cannot continue.'));
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
 * but it throws an error if started has already been called previous to this iteration.  This
 * function also sets the edited flag on the InfraCodeVersion to false, since it can no longer
 * be changed after this point.
 * @param user user object of the current user
 * @param cb callback
 */
ContextVersionSchema.methods.setBuildStarted = function (user, dockerHost, buildProps, cb) {
  if (!dockerHost) {
    throw new Error('dockerHost is required');
  }
  if (typeof buildProps === 'function') {
    cb = buildProps;
    buildProps = {};
  }
  var update = {};
  // FIXME: lets get rid of cv.containerId soon (now mirrors build._id)
  // - used for buildLogs (change to build._id)
  update.$set = {
    'build.started' : Date.now(),
    'build.triggeredBy.github': user.accounts.github.id,
    'dockerHost': dockerHost,
    'containerId': this.build._id
  };
  Object.keys(buildProps).forEach(function (key) {
    update.$set['build.'+key] = buildProps[key];
  });

  var contextVersion = this;
  var query;

  if (buildProps.triggeredAction && buildProps.triggeredAction.appCodeVersion) {
    query = {
      _id: contextVersion._id,
      'build.started': {
        $exists: false
      },
      'appCodeVersions.lowerRepo': buildProps.triggeredAction.appCodeVersion.repo.toLowerCase()
    };
    update.$set['appCodeVersions.$.commit'] = buildProps.triggeredAction.appCodeVersion.commit;
  } else {
    query = {
      _id: contextVersion._id,
      'build.started': {
        $exists: false
      }
    };
  }
  async.waterfall([
    findAndCheckInfraCodeEditedFlag,
    setContextVersionBuildStarted,
    afterSetBuildStarted
  ], cb);

  function findAndCheckInfraCodeEditedFlag(cb) {
    InfraCodeVersion.findById(contextVersion.infraCodeVersion, function (err, infraCodeVersion) {
      if (err) {
        cb(err);
      } else if (!infraCodeVersion) {
        cb(Boom.conflict('InfraCodeVersion could not be found', {
          debug: {
            contextVersion: contextVersion._id,
            infraCodeVersion: contextVersion.infraCodeVersion
          }
        }));
      } else if (infraCodeVersion.parent) {
        if (!infraCodeVersion.edited) {
          // If the current infraCodeVersion hasn't been edited, then we should set the
          // contextVersion's infraCode to its parent, and delete this one
          update.$set.infraCodeVersion = infraCodeVersion.parent;
          InfraCodeVersion.remove(
            {
              _id: infraCodeVersion._id,
              edited: false
            }, function() {
              cb();
            });
        } else {
          cb();
        }
      } else {
        // Something went horribly wrong somewhere if we're here.  If an infraCode doesn't have
        // a parent, and it doesn't have an edited property, it's a source
        cb(Boom.conflict('Cannot use source infracode versions with builds', {
          debug: {
            contextVersion: contextVersion._id,
            infraCodeVersion: contextVersion.infraCodeVersion
          }
        }));
      }
    });
  }

  function setContextVersionBuildStarted(cb) {
   ContextVersion.findOneAndUpdate(query, update, cb);
  }

  function afterSetBuildStarted(updatedContextVersion, cb) {
    if (!updatedContextVersion) {
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
  }
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
    var now = dockerInfo.completed;
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
        'build.completed' : now,
        'build.duration': now - new Date(contextVersion.build.started),
        'build.dockerTag': dockerInfo.dockerTag,
        'build.dockerImage': dockerInfo.dockerImage,
        'build.log': dockerInfo.buildLog,
        'dockerHost': dockerInfo.dockerHost
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

/**
 * Finds and replaces with parentInfra if infra is unedited
 * @param  {callback} callback(self/duplicateVersion)
 */
ContextVersionSchema.methods.dedupeInfra = function (cb) {
  var contextVersion = this;
  var icvId = contextVersion.infraCodeVersion;
  InfraCodeVersion.findById(icvId, function (err, icv) {
    if (err) { return cb(err); }
    if (!icv.edited) {
      contextVersion.set('infraCodeVersion', icv.parent);
      contextVersion.save(function (err) {
        if (err) { return cb(err); }
        InfraCodeVersion.removeById(icvId, next);
      });
    }
    else {
      next();
    }
    function next (err) {
      cb(err, contextVersion);
    }
  });
};

/**
 * Looks for completed contextVersions with the same state
 * @param  {Function} callback callback(self/duplicateVersion)
 */
var dupeCopyFields = ['build', 'dockerHost', 'containerId'];
ContextVersionSchema.methods.dedupe = function (callback) {
  var self = this;
  if (this.started) {
    // build is already started and possibly built. no need to check for duplicate.
    return callback(null, self);
  }
  async.waterfall([
    dedupeInfra,
    dedupeSelf
  ], callback);
  var query, opts, allFields;
  function dedupeInfra (cb) {
    self.dedupeInfra(function (err) {
      cb(err);
    });
  }
  function dedupeSelf (cb) {
    // ownership is essentially verified by infraCodeVersionId
    // but we should make this more secure
    query = {
      'build.started': { $exists: true },
      infraCodeVersion: self.infraCodeVersion
    };
    query = addAppCodeVersionQuery(self, query);
    opts = {
      sort : '-build.started',
      limit: 1
    };
    allFields = null;
    // find all potential duplicates (acv branches may be different)
    ContextVersion.find(query, allFields, opts, function (err, duplicates) {
      if (err) { return cb(err); }
      var latestDupe = duplicates[0];
      if (!latestDupe) {
        // no dupes found
        cb(null, self);
      }
      else { // dupes were found
        if (self.appCodeVersions.length === 0) {
          // No github repos, so no chance for branch to
          // latestDupe is latestExactDupe in this case
          self.remove(error.logIfErr); // delete self
          cb(null, latestDupe);
        }
        else {
          // contextVersion has github repos -
          // query only matches repo and commit (bc same commit can live on separate branches)
          // make sure github repos branches match.
          latestDupeWithSameBranches(function (err, latestExactDupe) {
            if (err) {
              cb(err);
            }
            else if (latestExactDupe &&
                dateGTE(latestExactDupe.build.started, latestDupe.build.started)) {
              // latest exact dupe will have exact same appCodeVersion branches
              // also compare dates with the build-equivalent dupe and make sure it is the latest
              self.remove(error.logIfErr); // delete self
              cb(null, latestExactDupe);
            }
            else {
              // no exact dupe found (repos and commits matched but branches didnt),
              // or exact dupe was not the absolute latest build we have with that state (acv, icv)
              // (we always want to use the latest build)
              // so just copy the latest dupe's build info to the cv
              // This query is atomic and makes sure only one deduplication will occur (race)
              // dedupes will always be started, so we include 'build.started' in the query.
              var query = {
                _id: self._id,
                'build.started': { $exists: false }
              };
              var update = {
                $set: pick(latestDupe.toJSON(), dupeCopyFields)
              };
              ContextVersion.findOneAndUpdate(query, update, function (err, updated) {
                if (err) {
                  cb(err);
                }
                else if (!updated) {
                  // some other dedupe occurred before us.
                  cb(Boom.conflict('Context version is already building'));
                }
                else {
                  cb(null, updated);
                }
              });
            }
          });
        }
      }
    });
  }
  function latestDupeWithSameBranches (cb) {
    query.$and.map(function (acvQuery, i) {
      if (acvQuery.appCodeVersions.$elemMatch) {
        acvQuery.appCodeVersions.$elemMatch.lowerBranch =
          self.appCodeVersions[i].lowerBranch;
      }
      return acvQuery;
    });
    ContextVersion.find(query, allFields, opts, function (err, exactDupes) {
      if (err) { return cb(err); }
      cb(null, exactDupes[0]);
    });
  }
};

ContextVersionSchema.methods.updateBuildError = function (err, cb) {
  var contextVersion = this;
  var now = Date.now();
  var log = keypather.get(err, 'data.docker.log') || '';
  log = log.toString().replace(/\0/g, '');
  var started = contextVersion.build.started || now; // started wont be set if mavis findDock fails
  contextVersion.update({
    $set: {
      'build.completed' : now,
      'build.duration': now - new Date(started),
      'build.error.message': err.message,
      'build.error.stack': err.stack,
      'build.log': log
    }
  }, cb);
};

ContextVersionSchema.statics.addGithubRepoToVersion =
  function (user, contextVersionId, repoInfo, cb) {
  // order of operations:
  // - find contextVersionId, check to make sure it doesn't have the repo yet (409 otherwise), and
  //   add the new repo to it (atomically)
  // - add the hook through github (pass error if we come to one)
  // - if failed to add hook, revert change in mongo
  var githubToken = user.accounts.github.accessToken;
  var lowerRepo = repoInfo.repo.toLowerCase();
  var github = new Github({ token: githubToken });
  ContextVersion.findOneAndUpdate({
    _id: contextVersionId,
    'appCodeVersions.lowerRepo': { $ne: lowerRepo }
  }, {
    $push: { appCodeVersions: repoInfo }
  }, function (err, doc) {
    // this is our check to make sure the repo isn't added to this context version yet
    if (err) { cb(err); }
    else if (!doc) { cb(Boom.conflict('Github Repository already added')); }
    else {
      async.waterfall([
        github.getRepo.bind(github, repoInfo.repo),
        function (repo, headers, cb) {
          if (isFunction(headers)) {
            // sometimes this is funky, but this check is fine
            cb = headers;
          }
          github.createRepoHookIfNotAlready(repoInfo.repo, cb);
        },
        github.addDeployKeyIfNotAlready.bind(github, repoInfo.repo)
      ], function (updateErr, deployKeys) {
        if (updateErr) {
          // we failed to talk with github - remove entry
          // remove entry in appCodeVersions
          ContextVersion.findOneAndUpdate({
            _id: contextVersionId
          }, {
            $pull: {
              appCodeVersions: {
                lowerRepo: lowerRepo
              }
            }
          }, function (err, doc) {
            if (updateErr || err) { cb(updateErr || err); }
            else if (!doc) {
              cb(Boom.badImplementation('could not remove the repo from your project'));
            }
            else { cb(null); }
          });
        } else {
          // update the database with the keys that were added, and gogogo!
          ContextVersion.findOneAndUpdate({
            _id: contextVersionId,
            'appCodeVersions.lowerRepo': lowerRepo
          }, {
              $set: {
              'appCodeVersions.$.publicKey': deployKeys.publicKey,
              'appCodeVersions.$.privateKey': deployKeys.privateKey
            }
          }, function (err, doc) {
            // we're all done with the updated. if everything went well, we're in business!
            if (err) { cb(err); }
            else if (!doc) { cb(Boom.badImplementation('could not save deploy keys')); }
            else { cb(null); }
          });
        }
      });
    }
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

ContextVersionSchema.methods.updateAppCodeVersion = function (appCodeVersionId, data, cb) {
  debug('_pushAppCodeVersion');
  var contextVersion = this;
  var query = {
    _id: contextVersion._id,
    'appCodeVersions._id': appCodeVersionId
  };
  var update = {
    $set  : {}
  };
  if (data.branch) {
    update.$set['appCodeVersions.$.branch'] = data.branch;
    update.$set['appCodeVersions.$.lowerBranch'] = data.branch.toLowerCase();
  }
  if (data.commit) {
    update.$set['appCodeVersions.$.commit'] = data.commit;
  }

  ContextVersion.findOneAndUpdate(query, update, function (err, contextVersion) {
    if (err) {
      cb(err);
    }
    else if (!contextVersion) {
      cb(Boom.notFound('AppCodeVersion with _id "'+appCodeVersionId+'" not found'));
    }
    else {
      cb(null, contextVersion);
    }
  });
};

ContextVersionSchema.statics.modifyAppCodeVersionByRepo =
  function (versionId, repo, branch, commit, cb) {
    debug('updateAppCodeVersionByRepo');
    ContextVersion.findOneAndUpdate({
      _id: versionId,
      'appCodeVersions.lowerRepo': repo.toLowerCase()
    }, {
      $set: {
        'appCodeVersions.$.branch': branch,
        'appCodeVersions.$.lowerBranch': branch.toLowerCase(),
        'appCodeVersions.$.commit': commit
      }
    }, cb);
  };

/**
 * looks for build from contextVersions with the same hash and
 * appcode then updates build if dupe
 * @return contextVersion self
 */
ContextVersionSchema.methods.dedupeBuild = function (callback) {
  var self = this;
  var icvId = self.infraCodeVersion;
  async.waterfall([
    getHash,
    setHash,
    findPendingDupes,
    findCompletedDupes, // must be done after pending due to race
    replaceIfDupe,
  ], callback);

  function getHash (cb) {
    InfraCodeVersion.findById(icvId, function (err, icv) {
      if (err) { return cb(err); }
      icv.getHash(cb);
    });
  }
  // hash should be set here so dedup will catch 2 builds comming at same time
  function setHash (hash, cb) {
    self.update({
      $set: {
        'build.hash' : hash
      }
    }, function(err) {
      if (err) { return cb(err); }
      self.build.hash = hash;
      cb();
    });
  }
  // find oldest pending build, (excluding self) which match hash and app-code
  // only one pending build will win and it should be the one that started first
  function findPendingDupes (cb) {
    var query = {
      'build.completed': { $exists: false },
      'build.hash': self.build.hash,
      'build._id': { $ne: self.build._id } // ignore self
    };
    query = addAppCodeVersionQuery(self, query);
    var opts = {
      sort : 'build.started',
      limit: 1
    };
    ContextVersion.find(query, null, opts, function (err, duplicates) {
      if (err) { return cb(err); }
      var oldestPending = duplicates[0];
      if (oldestPending &&
          dateLTE(self.build.started, oldestPending.build.started)) {
        // self is the winner, don't dedupe it. (must cb with null args for waterfall)
        cb(null, null);
      }
      else {
        // use oldest pending dupe (might be null)
        cb(null, oldestPending);
      }
    });
  }
  // find youngest completed builds, (excluding self) which match hash and app-code
  function findCompletedDupes (pendingDupe, cb) {
    // always use oldest pending duplicate if it exists
    if (pendingDupe) {
      return cb(null, pendingDupe);
    }
    var query = {
      'build.completed': { $exists: true },
      'build.hash': self.build.hash,
      'build._id': { $ne: self.build._id } // ignore self
    };
    query = addAppCodeVersionQuery(self, query);
    var opts = {
      sort : '-build.started',
      limit: 1
    };
    ContextVersion.find(query, null, opts, function (err, duplicates) {
      // use oldest dupe (might be null)
      cb(err, duplicates[0]);
    });
  }
  function replaceIfDupe(dupe, cb) {
    if (dupe) { // dupe found
      dogstatsd.increment('api.contextVersion.build.deduped');
      self.copyBuildFromContextVersion(dupe, cb);
    } else {
      dogstatsd.increment('api.contextVersion.build.noDupe');
      cb(null, self);
    }
  }
};

ContextVersionSchema.methods.copyBuildFromContextVersion = function (contextVersion, cb) {
  var self = this;
  copyBuildAndContainerId(contextVersion, function (err, updated) {
    if (err) { return cb(err); }
    if (!contextVersion.build.completed) {
      // if contextVersion.build was not completed it could've have
      //   completed after we originally fetched it.
      // fetch it again, and copy the build just in case it completed (race)
      ContextVersion.findById(contextVersion._id, function (err, cv) {
        if (err) { return cb(err); }
        copyBuildAndContainerId(cv, cb);
      });
    }
    else {
      cb(null, updated);
    }
  });

  function copyBuildAndContainerId (cv, cb) {
    var query = {
      _id: self._id
    };
    ContextVersion.findOneAndUpdate(query, {
      $set: pick(cv.toJSON(), dupeCopyFields)
    }, function (err, updated) {
      if (err) { return cb(err); }
      updated.build.dupeFound = true; // used in middleware (cv/build route)
      cb(null, updated);
    });
  }
};

var ContextVersion = module.exports = mongoose.model('ContextVersions', ContextVersionSchema);
