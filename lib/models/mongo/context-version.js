/**
 * Versions of a Context!
 * @module models/version
 */
'use strict';

var Boom = require('dat-middleware').Boom;
var async = require('async');
var exists = require('101/exists');
var find = require('101/find');
var hasKeypaths = require('101/has-keypaths');
var isFunction = require('101/is-function');
var isString = require('101/is-string');
var keypather = require('keypather')();
var mongoose = require('mongoose');
var noop = require('101/noop');
var pick = require('101/pick');
var put = require('101/put');

var Github = require('models/apis/github');
var InfraCodeVersion = require('models/mongo/infra-code-version');
var dogstatsd = require('models/datadog');
var error = require('error');
var logger = require('middlewares/logger')(__filename);
var messenger = require('socket/messenger');

var log = logger.log;

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
    query.$and.push({ appCodeVersions: { $size: contextVersion.appCodeVersions.length } });
  } else {
    query.appCodeVersions = { $size: 0 };
  }
  return query;
};

function emitIfCompleted (cv) {
  log.trace({
    tx: true,
    cv: cv
  }, 'emitIfCompleted');
  if (cv.build.completed) {
    log.trace({tx: true}, 'emitIfCompleted completed true');
    messenger.emitContextVersionUpdate(cv, 'build_completed');
  }
  else {
    log.trace({tx: true}, 'emitIfCompleted completed false');
  }
}

var ContextVersionSchema = require('models/mongo/schemas/context-version');

ContextVersionSchema.methods.writeLogsToPrimusStream = function (stream, cb) {
  if (!cb) { cb = noop; }
  var logs = keypather.get(this, 'build.log');
  if (isString(logs)) {
    logs = logs.split(/\r?\n/);
    logs = logs.map(function (l) {
      return {
        type: 'log',
        content: l
      };
    });
  } else if (!Array.isArray(logs)) {
    cb(new Error('cannot stream logs that are not strings or arrays'));
  }
  // we want to async this so that node doesn't loop forever writing to the
  // stream.
  async.eachSeries(logs, writeToStream, function (err) {
    if (err) { return cb(err); }
    stream.end();
    cb(err);
  });

  function writeToStream (o, callback) {
    stream.write(o);
    callback();
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
  'owner',
  'advanced'
];

ContextVersionSchema.statics.createDeepCopy = function (user, version, cb) {
  var ContextVersion = this;
  version = version.toJSON ? version.toJSON() : version;
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
    'containerId': this.build._id // FIXME: this is currently used in frontend for dockerLogs
  };
  Object.keys(buildProps).forEach(function (key) {
    update.$set['build.'+key] = buildProps[key];
  });

  var contextVersion = this;
  var query = {
    _id: contextVersion._id,
    'build.started': {
      $exists: false
    }
  };

  var triggerAcv = keypather.get(buildProps, 'triggeredAction.appCodeVersion');
  if (triggerAcv) {
    query['appCodeVersions.lowerRepo']      = triggerAcv.repo.toLowerCase();
    update.$set['appCodeVersions.$.commit'] = triggerAcv.commit;
  }
  async.waterfall([
    findAndCheckInfraCodeEditedFlag,
    setContextVersionBuildStarted,
    afterSetBuildStarted
  ], cb);

  function findAndCheckInfraCodeEditedFlag (cb) {
    InfraCodeVersion.findById(contextVersion.infraCodeVersion, function (err, infraCodeVersion) {
      if (err) { return cb(err); }
      if (!infraCodeVersion) {
        err = Boom.conflict('InfraCodeVersion could not be found', {
          debug: {
            contextVersion: contextVersion._id,
            infraCodeVersion: contextVersion.infraCodeVersion
          }
        });
        return cb(err);
      }
      if (!infraCodeVersion.parent) {
        // Something went horribly wrong somewhere if we're here.  If an infraCode doesn't have
        // a parent, and it doesn't have an edited property, it's a source
        err = Boom.conflict('Cannot use source infracode versions with builds', {
          debug: {
            contextVersion: contextVersion._id,
            infraCodeVersion: contextVersion.infraCodeVersion
          }
        });
        return cb(err);
      }
      if (!infraCodeVersion.edited) {
        // If the current infraCodeVersion hasn't been edited, then we should set the
        // contextVersion's infraCode to its parent, and delete this one
        update.$set.infraCodeVersion = infraCodeVersion.parent;
        InfraCodeVersion.removeById(infraCodeVersion._id, error.logIfErr); //background
      }
      cb();
    });
  }

  function setContextVersionBuildStarted (cb) {
    ContextVersion.findOneAndUpdate(query, update, cb);
  }

  function afterSetBuildStarted (updatedContextVersion, cb) {
    if (!updatedContextVersion) {
      var err = Boom.conflict('Context version build is already in progress.', {
        debug: { contextVersion : contextVersion._id }
      });
      return cb(err);
    }
    messenger.emitContextVersionUpdate(updatedContextVersion, 'build_started');
    cb(null, updatedContextVersion);
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
  /*jshint maxcomplexity:6*/
  /*jshint maxdepth:3*/
  var logData = {
    tx: true,
    started: this.started,
    infraCodeVersion: this.infraCodeVersion
  };
  log.info(logData, 'ContextVersionSchema.methods.dedupe');
  var self = this;
  if (!this.owner) {
    log.warn(logData, 'dedupe !this.owner');
    error.log(Boom.badImplementation('context version owner is null during dedupe', { cv: this }));
  }
  if (this.started) {
    log.warn(logData, 'dedupe !this.started');
    // build is already started and possibly built. no need to check for duplicate.
    return callback(null, self);
  }
  async.waterfall([
    dedupeInfra,
    dedupeSelf
  ], callback);
  var query, opts, allFields;
  function dedupeInfra (cb) {
    log.info(logData, 'ContextVersionSchema.methods.dedupe dedupeInfra');
    self.dedupeInfra(function (err) {
      if (err) {
        log.warn(put({
          err: err
        }, logData), 'dedupe self.dedupeInfra error');
      }
      else {
        log.trace(logData, 'dudupe self.dedupeInfra success');
      }
      cb(err);
    });
  }
  function dedupeSelf (cb) {
    log.info(logData, 'ContextVersionSchema.methods.dedupe dedupeSelf');
    // ownership is essentially verified by infraCodeVersionId
    // but we should make this more secure
    query = {
      'build.started': { $exists: true },
      infraCodeVersion: self.infraCodeVersion
    };
    if (exists(self.advanced)) {
      query.advanced = self.advanced;
    }
    query = addAppCodeVersionQuery(self, query);
    opts = {
      sort : '-build.started',
      limit: 1
    };
    allFields = null;
    // find all potential duplicates (acv branches may be different)
    ContextVersion.find(query, allFields, opts, function (err, duplicates) {
      if (err) {
        log.error(put({
          err: err
        }, logData), 'dedupe dedupeSelf ContextVersion.find error');
        return cb(err);
      }
      var latestDupe = duplicates[0];
      if (!latestDupe) {
        log.trace(logData, 'dedupe dedupeSelf no dupes found');
        // no dupes found
        cb(null, self);
      }
      else if (latestDupe.build.completed && keypather.get(latestDupe, 'build.error.message')) {
        // Build container failed, do not dedupe
        log.trace(logData, 'dedupe dedupeSelf build container failed, do not dedupe');
        callback(null, self);
      }
      else { // dupes were found
        log.trace(logData, 'dedupe dedupeSelf - dupes found');
        if (self.appCodeVersions.length === 0) {
          log.trace(logData, 'dedupe dedupeSelf - dupes found + no branches');
          // No github repos, so no chance for branch to
          // latestDupe is latestExactDupe in this case
          self.remove(error.logIfErr); // delete self
          if (!latestDupe.owner) {
            var msg = 'latestDupe context version owner is null after dedupe';
            error.log(Boom.badImplementation(msg, { cv: latestDupe }));
          }
          cb(null, latestDupe);
        }
        else {
          log.trace(logData, 'dedupe dedupeSelf - dupes found w/ branches');
          // contextVersion has github repos -
          // query only matches repo and commit (bc same commit can live on separate branches)
          // make sure github repos branches match.
          latestDupeWithSameBranches(function (err, latestExactDupe) {
            if (err) {
              log.error(put({
                err: err
              }, logData), 'dedupe dedupeSelf latestDupeWithSameBranches error');
              return cb(err);
            }
            if (latestExactDupe &&
                dateGTE(latestExactDupe.build.started, latestDupe.build.started)) {
              log.trace(logData, 'dedupe dedupeSelf latestDupeWithSameBranches '+
                        'found latest exact dupe');
              // latest exact dupe will have exact same appCodeVersion branches
              // also compare dates with the build-equivalent dupe and make sure it is the latest
              self.remove(error.logIfErr); // delete self
              if (!latestExactDupe.owner) {
                log.warn(logData, 'dedupe dedupeSelf latestDupeWithSameBranches '+
                         'found latest exact dupe !owner');
                var msg = 'latestDupe context version owner is null after exact dedupe';
                error.log(Boom.badImplementation(msg, { cv: latestDupe }));
              }
              cb(null, latestExactDupe);
            }
            else {
              log.trace(logData, 'dedupe dedupeSelf latestDupeWithSameBranches no dupe found');
              // no exact dupe found (repos and commits matched but branches didnt),
              // or exact dupe was not the absolute latest build we have with that state (acv, icv)
              // NOTE: Rely on "dedupeBuild" method called later on to handle this dedupe case
              cb(null, self);
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

/**
 * set context version docker image builder running information
 * @param {object}   opts:           should container following
 *                     buildId: contextVersion.build._id
 *                     dockerContainer: image builder container id
 *                     dockerTag: tag of image which context version is associated
 *                     dockerHost: dockerHost on which the build is building (or was built)
 *                     network: network object with networkIp and hostIp
 * @param {Function} cb              callback
 */
ContextVersionSchema.statics.updateContainerByBuildId = function (opts, cb) {
  var update = {
    $set: {
      'build.dockerContainer': opts.buildContainerId,
      'build.dockerTag': opts.tag,
      'build.network': opts.network,
      dockerHost: opts.host,
    }
  };
  ContextVersion.updateBy('build._id', opts.buildId, update, { multi: true }, cb);
};

/**
 * update context version to be completed
 * @param {string}   dockerContainer container id of image builder associted with context version
 * @param {string}   dockerInfo      container id of image builder associted with context version
 * @param {function} cb              callback
 */
ContextVersionSchema.statics.updateBuildCompletedByContainer =
  function (dockerContainer, dockerInfo, cb) {
    log.info({tx: true}, 'ContextVersionSchema.statics.updateBuildCompletedByContainer');
    var required = ['log', 'failed'];
    // The docker image is only required if the build succeeded
    if (!dockerInfo.failed) {
      required.push('dockerImage');
    }
    required.every(function (key) {
      if (!exists(dockerInfo[key])) {
        cb(Boom.badRequest('ContextVersion requires '+key));
        return false;
      }
      return true;
    });

    var update = {
      $set: {
        'build.completed'  : Date.now(),
        'build.log'        : dockerInfo.log,
        'build.failed'     : dockerInfo.failed
      }
    };
    var errorMessage = keypather.get(dockerInfo, 'error.message');
    if (errorMessage) {
      update.$set['error.message'] = errorMessage;
    }
    if (!dockerInfo.failed) {
      update.$set['build.dockerImage'] = dockerInfo.dockerImage;
    }
    log.trace({
      tx: true,
      update: update
    }, 'updateBuildCompletedByContainer: update data');
    var opts = { multi: true };
    ContextVersion.updateBy('build.dockerContainer', dockerContainer, update, opts, function (err) {
      if (err) {
        return cb(err); // callback
      }

      // emit completed event for each cv, currently only used in tests (github hooks)
      // ^And /builds/:id/actions/build route which waits for this event
      //   ^ should no longer be the case when logic in this route is moved into worker
      ContextVersion.findBy('build.dockerContainer', dockerContainer, function (err, versions) {
        if (err) {
          error.log(err);
          return cb(err);
        }
        versions.forEach(emitIfCompleted);
        cb();
      });
    });
  };

/**
 * update context versions build.error w/ matching build.id
 * @param  {string}   buildId  build._id to query contextVersions by
 * @param  {error}    err      build error
 * @param  {Function} cb       callback
 */
ContextVersionSchema.statics.updateBuildErrorByBuildId = function (buildId, err, cb) {
  logger.log.info({tx: true}, 'ContextVersionSchema.statics.updateBuildErrorByBuildId');
  var now = Date.now();
  var log = keypather.get(err, 'data.docker.log') || '';
  var update = {
    $set: {
      'build.completed' : now,
      'build.error.message': err.message,
      'build.error.stack': err.stack,
      'build.log': log
    }
  };
  var opts = {
    multi: true
  };
  ContextVersion.updateBy('build._id', buildId, update, opts, function (err) {
    if (err) {
      return cb(err); // callback
    }
    // emit errored event for each cv, currently only used in tests (github hooks)
    ContextVersion.findBy('build._id', buildId, function (err, versions) {
      if (err) {
        error.log(err);
        return cb(err);
      }
      versions.forEach(emitIfCompleted);
      cb();
    });
  });
};

/**
 * update context versions build.error w/ matching build.id
 * @param  {string}   dockerContainer  build.dockerContainer to query contextVersions by
 * @param  {error}    err     build error
 * @param  {Function} cb      callback
 */
ContextVersionSchema.statics.updateBuildErrorByContainer = function (dockerContainer, err, cb) {
  logger.log.info({tx: true}, 'ContextVersionSchema.statics.updateBuildErrorByContainer');
  var now = Date.now();
  var log = keypather.get(err, 'data.docker.log') || [];
  var update = {
    $set: {
      'build.completed' : now,
      'build.error.message': err.message,
      'build.error.stack': err.stack,
      'build.log': log
    }
  };
  var opts = {
    multi: true
  };
  ContextVersion.updateBy('build.dockerContainer', dockerContainer, update, opts, function () {
    cb(err); // callback
    // emit errored event for each cv, currently only used in tests (github hooks)
    ContextVersion.findBy('build.dockerContainer', dockerContainer, function (err, versions) {
      if (err) { return error.log(err); }
      versions.forEach(emitIfCompleted);
    });
  });
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
          github.createRepoHookIfNotAlready(repoInfo.repo, function (err) {
            cb(err, repo);
          });
        },
        function (repo, cb) {
          github.addDeployKeyIfNotAlready(repoInfo.repo, function (err, deployKeys) {
            cb(err, deployKeys, repo);
          });
        }
      ], function (updateErr, deployKeys, repo) {
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
              'appCodeVersions.$.defaultBranch': repo.default_branch,
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
  log.trace({
    tx: true,
    appCodeVersionId: appCodeVersionId
  }, 'pullAppCodeVersion');
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
/**
 * returns the main appCodeVersion
 * @param  {object} appCodeVersions CV's appCodeVersions array
 * @return {object} main appCodeVersion or null if not exist
 */
ContextVersionSchema.statics.getMainAppCodeVersion = function (appCodeVersions) {
  log.trace({
    tx: true,
    appCodeVersions: appCodeVersions
  }, 'ContextVersionSchema.statics.getMainAppCodeVersion');
  if (!appCodeVersions) { return null; }
  return find(appCodeVersions, function (appCodeVersion) {
    return !appCodeVersion.additionalRepo;
  });
};
/**
 * returns the main appCodeVersion
 * @return {object} main appCodeVersion
 */
ContextVersionSchema.methods.getMainAppCodeVersion = function () {
  log.trace({
    tx: true
  }, 'ContextVersionSchema.methods.getMainAppCodeVersion');
  return  ContextVersion.getMainAppCodeVersion(this.appCodeVersions);
};

ContextVersionSchema.methods.modifyAppCodeVersionWithLatestCommit = function (user, cb) {
  log.trace({
    tx: true,
    user: user
  }, 'modifyAppCodeVersionWithLatestCommit');
  var self = this;
  var updatableAdditionalRepos = this.appCodeVersions.filter(function (acv) {
    return acv.additionalRepo && acv.useLatest;
  });
  // if nothing to update - just return current contextVersion
  if (!updatableAdditionalRepos || updatableAdditionalRepos.length === 0) {
    return cb(null, this);
  }
  var githubToken = keypather.get(user, 'accounts.github.accessToken');
  async.each(updatableAdditionalRepos, function (acv, eachCb) {
    var github = new Github({ token: githubToken });
    github.getBranch(acv.repo, acv.branch, function (err, branch) {
      if (err) {
        return eachCb(err);
      }
      var commit = keypather.get(branch, 'commit.sha');
      self.modifyAppCodeVersion(acv._id, { commit: commit }, eachCb);
    });
  }, function (err) {
    if (err) {
      return cb(err);
    }
    // we need to refetch model since it was changed
    ContextVersion.findById(self._id, cb);
  });
};

ContextVersionSchema.methods.modifyAppCodeVersion = function (appCodeVersionId, data, cb) {
  /*jshint maxcomplexity:6*/
  log.trace({
    tx: true,
    appCodeVersionId: appCodeVersionId,
    data: data
  }, 'ContextVersionSchema.methods.modifyAppCodeVersion');
  var contextVersion = this;
  var query = {
    _id: contextVersion._id,
    'appCodeVersions._id': appCodeVersionId
  };
  var update = {
    $set: {}
  };
  if (data.branch) {
    update.$set['appCodeVersions.$.branch'] = data.branch;
    update.$set['appCodeVersions.$.lowerBranch'] = data.branch.toLowerCase();
  }
  if (data.commit) {
    update.$set['appCodeVersions.$.commit'] = data.commit;
  }
  if (data.transformRules) {
    update.$set['appCodeVersions.$.transformRules'] = data.transformRules;
  }

  if (data.useLatest === true || data.useLatest === false) {
    update.$set['appCodeVersions.$.useLatest'] = data.useLatest;
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
    log.trace({
      tx: true,
      versionId: versionId,
      repo: repo,
      branch: branch,
      commit: commit
    }, 'ContextVersionSchema.statics.modifyAppCodeVersionByRepo ');
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

ContextVersionSchema.statics.findAllRepos = function (cb) {
  ContextVersion.aggregate([
    {
      $unwind: '$appCodeVersions'
    },
    {
      $group: {
        _id: '$appCodeVersions.lowerRepo',
        creators: {
          $addToSet:'$createdBy.github'
        }
      }
    }
  ], cb);
};

/**
 * looks for build from contextVersions with the same hash and
 * appcode then updates build if dupe
 * @return contextVersion self
 */
ContextVersionSchema.methods.dedupeBuild = function (callback) {
  var logData = {
    tx: true
  };
  log.info(logData, 'ContextVersionSchema.methods.dedupeBuild');
  var self = this;
  var icvId = self.infraCodeVersion;
  async.waterfall([
    getHash,
    setHash,
    findPendingDupes,
    findCompletedDupes, // must be done after pending due to race
    checkOwnerMatch,
    replaceIfDupe,
  ], callback);

  function getHash (cb) {
    log.info(logData, 'dedupeBuild: getHash');
    InfraCodeVersion.findById(icvId, function (err, icv) {
      if (err) {
        log.error(put({
          err: err
        }, logData), 'dedupeBuild: getHash ICV.findById error');
        return cb(err);
      }
      log.trace(put({
        infraCodeVersion: icv.toJSON()
      }, logData), 'dedupeBuild: getHash ICV.findById success');
      icv.getHash(cb);
    });
  }
  // hash should be set here so dedup will catch 2 builds comming at same time
  function setHash (hash, cb) {
    log.info(put({
      hash: hash
    }, logData), 'dedupeBuild: setHash');
    self.update({
      $set: {
        'build.hash' : hash
      }
    }, function(err) {
      if (err) {
        log.error(put({
          err: err
        }, logData), 'dedupeBuild: setHash error');
        return cb(err);
      }
      log.trace(put({
        hash: hash
      }, logData), 'dedupeBuild: setHash success');
      self.build.hash = hash;
      cb();
    });
  }

  // find oldest pending build, (excluding self) which match hash and app-code
  // only one pending build will win and it should be the one that started first
  function findPendingDupes (cb) {
    log.info(logData, 'dedupeBuild: findPendingDupes');
    var query = {
      'build.completed': { $exists: false },
      'build.hash': self.build.hash,
      'build._id': { $ne: self.build._id } // ignore self
    };
    if (exists(self.advanced)) {
      query.advanced = self.advanced;
    }
    query = addAppCodeVersionQuery(self, query);
    var opts = {
      sort : 'build.started',
      limit: 1
    };
    ContextVersion.find(query, null, opts, function (err, duplicates) {
      if (err) {
        log.error(put({err: err}, logData), 'dedupeBuild: findPendingDupes CV.find error');
        return cb(err);
      }
      var oldestPending = duplicates[0];
      if (oldestPending &&
          dateLTE(self.build.started, oldestPending.build.started)) {
        log.trace(logData, 'dedupeBuild: findPendingDupes self winner');
        // self is the winner, don't dedupe it. (must cb with null args for waterfall)
        cb(null, null);
      }
      else {
        // use oldest pending dupe (might be null)
        log.trace(logData, 'dedupeBuild: findPendingDupes oldest pending dupe');
        cb(null, oldestPending);
      }
    });
  }
  // find youngest completed builds, (excluding self) which match hash and app-code
  function findCompletedDupes (pendingDupe, cb) {
    log.info(logData, 'dedupeBuild: findCompletedDupes');
    // always use oldest pending duplicate if it exists
    if (pendingDupe) {
      log.trace(logData, 'dedupeBuild: findCompletedDupes pendingDupe');
      return cb(null, pendingDupe);
    }
    var query = {
      'build.completed': { $exists: true },
      'build.hash': self.build.hash,
      'build._id': { $ne: self.build._id } // ignore self
    };
    if (exists(self.advanced)) {
      query.advanced = self.advanced;
    }
    query = addAppCodeVersionQuery(self, query);
    var opts = {
      sort : '-build.started',
      limit: 1
    };
    ContextVersion.find(query, null, opts, function (err, duplicates) {
      // use oldest dupe (might be null)
      if (err) {
        log.error(put({
          err: err
        }, logData), 'dedupeBuild: findCompletedDupes ContextVersion.find error');
      }
      log.trace(put({
        dupe: keypather.get(duplicates[0], 'toJSON()')
      }, logData), 'dedupeBuild: findCompletedDupes ContextVersion.find result');
      cb(err, duplicates[0]);
    });
  }

  function checkOwnerMatch (dupe, cb) {
    log.info(logData, 'dedupeBuild: checkOwnerMatch');
    if (self.owner.github !== dupe.owner.github) {
      log.info(logData, 'dedupeBuild: owners do not match, stopping dedupe');
      return cb(null, null);
    }
    cb(null, dupe);
  }

  function replaceIfDupe(dupe, cb) {
    log.info(logData, 'dedupeBuild: replaceIfDupe');
    if (dupe) { // dupe found
      log.info(logData, 'dedupeBuild: replaceIfDupe dupe found');
      dogstatsd.increment('api.contextVersion.build.deduped');
      self.copyBuildFromContextVersion(dupe, cb);
    } else {
      log.info(logData, 'dedupeBuild: replaceIfDupe no dupe');
      dogstatsd.increment('api.contextVersion.build.noDupe');
      cb(null, self);
    }
  }
};

ContextVersionSchema.methods.copyBuildFromContextVersion = function (dupeCv, cb) {
  var logData = {
    tx: true
  };
  log.info(put({
    dupeCv: keypather.get(dupeCv, 'toJSON()')
  }, logData), 'ContextVersionSchema.methods.copyBuildFromContextVersion');
  var self = this; // cv to dedupe build.
  var $set = getSetForDedupe(this, dupeCv);
  self.modifySelf({ $set: $set }, function (err, dedupedCv) {
    // dedupedCv is updated version of self
    if (err) {
      log.error(put({
        err: err
      }, logData), 'copyBuildFromContextVersion: self.modifySelf error');
      return cb(err);
    }
    if (!dupeCv.build.completed) {
      log.trace(logData, 'copyBuildFromContextVersion: !dupeCv.build.completed');
      // check for race condition (read checkIfDedupedShouldBeUpdated's doc)
      checkIfDedupedShouldBeUpdated(dupeCv, dedupedCv, cb);
    }
    else {
      log.trace(logData, 'copyBuildFromContextVersion: dupeCv.build.completed emit');
      // since dupeCv was completed, dedupedCv was marked completed when the build was copied
      // emit deduped build_ completed event
      emitIfCompleted(dedupedCv);
      cb(null, dedupedCv);
    }
  });
};
/**
 * check if dedupe was never marked as completed due to race condition
 * @param  {ContextVersion}   dupeCv    duplicate context version found
 * @param  {ContextVersion}   dedupedCv context version who's build was deduped
 * @param  {Function}         cb        callback
 * If contextVersion.build was not completed it could have completed
 *     after we originally fetched it.
 * Fetch it again. If dupe is now completed, and dedupe is still not
 *     we must copy the dedupe again (to ensure it is marked as completed)
 *     bc of a race condition.
 */
function checkIfDedupedShouldBeUpdated (dupeCv, dedupedCv, cb) {
  dupeCv.findSelf(function (err, dupeCv) {
    if (err) { return cb(err); }
    if (!dupeCv.build.completed) {
      // dupe has still not completed..
      // dupe and deduped will be marked as completed when dupe finishes
      return cb(null, dedupedCv);
    }
    // dupe completed after the last time we fetched it
    // update deduped if it is not marked as completed
    // (happens if dedupe build occurred after dupe completed)
    var query = {
      _id: dedupedCv._id,
      'build.completed': { $exists: false } // incomplete
    };
    var $set = getSetForDedupe(dedupedCv, dupeCv);
    ContextVersion.findOneAndUpdate(query, { $set: $set }, function (err, updatedDedupedCv) {
      if (err) {
        return cb(err);
      }
      if (!updatedDedupedCv) {
        // deduped cv was already complete (marked when dupe finished)
        return cb(null, dedupedCv);
      }
      // deduped cv was not complete and was just marked as completed
      emitIfCompleted(updatedDedupedCv);
      cb(null, updatedDedupedCv);
    });
  });
}


ContextVersionSchema.statics.findByBuildId = function (buildId, cb) {
  // there may be multiple builds with the same build id!
  this.find({
    'build._id': buildId
  }, cb);
};

/**
 * clear dockerHost on this instance
 * @param  {Function} cb         (err, instance)
 */
ContextVersionSchema.methods.clearDockerHost = function (cb) {
  var logData = {
    tx: true,
    id: this._id
  };
  log.trace(logData, 'ContextVersionSchema.methods.clearDockerHost');
  ContextVersion.findOneAndUpdate({
    _id: this._id
  }, {
    'dockerHost': null,
  }, function (err, cv) {
    if (err) {
      log.error(put({
        err: err
      }, logData), 'ContextVersionSchema.methods.clearDockerHost findOneAndUpdate error');
      return cb(err);
    }
    log.trace(logData, 'ContextVersionSchema.methods.clearDockerHost findOneAndUpdate success');
    cb(null, cv);
  });
};

var ContextVersion = module.exports = mongoose.model('ContextVersions', ContextVersionSchema);


function getSetForDedupe (deduped, dupe) {
  deduped = deduped.toJSON ? deduped.toJSON() : deduped;
  dupe    = dupe.toJSON ? dupe.toJSON() : dupe;
  var $set = pick(dupe, dupeCopyFields);
  // advanced works differently than dupeCopyFields.
  // advanced should be false if the dupe or the cv is marked false.
  // when advanced is false it results in a better user experience,
  // as we can show more information about the instance's image.
  $set.advanced = (dupe.advanced === false || deduped.advanced === false) ?
    false : true;

  return $set;
}
