'use strict';

var mongoose = require('mongoose');
var async = require('async');
var Boom = require('dat-middleware').Boom;
var debug = require('debug')('runnable-api:build:model');
var BuildSchema = require('models/mongo/schemas/build');
var pick = require('101/pick');
var pluck = require('101/pluck');

BuildSchema.statics.findLatestBuildsWithContextVersions = function (contextVersions, cb) {
  debug('starting to aggregate for builds by contextVersions');
  var Build = this;
  var contextVersionIds = contextVersions.map(pluck('_id'));
  Build.aggregate()
    .match({
      contextVersions: { $in: contextVersionIds },
    })
    .sort({
      'created': 'asc'
    })
    .group({
      _id: '$environment',
      buildId: { $last: '$_id' }
    },
    function (err, buildInfos) {
      if (err) { return cb(err); }

      Build.filterBuildInfosByLatest(buildInfos, function (err, latestBuildInfos) {
        if (err) { return cb(err); }

        var buildIds = latestBuildInfos.map(pluck('buildId'));
        Build.findByIds(buildIds, cb);
      });
    });
};

BuildSchema.statics.filterBuildInfosByLatest = function (buildInfos, cb) {
  var Build = this;
  async.filter(buildInfos, function (buildInfo, acb) {
    var environmentId = buildInfo._id;
    var buildId = buildInfo.buildId;

    Build
      .find({
        environment: environmentId
      })
      .sort({
        'created': 'asc'
      })
      .limit(1)
      .exec(function (err, builds) {
        if (err) {
          cb(err); // main callback, async.filter doesn't handle errs
          cb = function () {};
        }
        else {
          acb(builds[0].toString() === buildId.toString());
        }
      });
  }, cb);
};

var fieldsToCopy = ['project', 'environment', 'contexts'];
BuildSchema.methods.createCopyWithNewVersions = function (newToOldVersionHash, cb) {
  var build = this;
  var newBuild = new Build();
  newBuild.set(pick(build, fieldsToCopy));
  newBuild.contextVersions = build.contextVersions.map(function (versionId) {
    var newVersionId = newToOldVersionHash[versionId];
    newBuild.newContextVersions.push(newVersionId);
    return newVersionId;
  });
  newBuild.save(cb);
};

/** Returns the latest build for every environment containing a given context
 *  @param {context} context Context to search for
 *  @param {function} cb function (err, [list of builds indexed by environment]) */
BuildSchema.statics.findLatestBuildsForContext = function (context, cb) {
  debug('starting to aggregate for builds');
  var Build = this;
  Build.aggregate()
    .match({
      contexts: context._id
    })
    // asc puts most recent dates last
    .sort({
      'created': 'asc'
    })
    .group({
      _id: '$environment',
      created: { $last: '$created' },
      createdBy: { $last: '$createdBy' },  //FIXME Remove this after TJ says so
      project: { $last: '$project' },
      environment: { $last: '$environment' },
      contexts: { $last: '$contexts' },
      contextVersions: { $last: '$contextVersions' },
      owner: { $last: '$owner' }
    })
    .exec(function (err, builds) {
      debug('aggregate result', err, builds.length);
      cb(null, builds);
    });
};

BuildSchema.methods.setInProgress = function (contextVersions,cb) {
  var build = this;
  if (build.started) {
    cb(Boom.badRequest('Build is already in progress'));
  }
  else if (build.completed) {
    cb(Boom.badRequest('Build has already completed'));
  }
  Build.findOneAndUpdate({
    _id: build._id,
    started: { $exists: false }
  }, {
    $set: {
      started: Date.now()
    }
  }, function (err, build) {
    if (err) {
      cb(err);
    }
    else if (!build) {
      cb(Boom.badRequest('Build is already in progress'));
    }
    else {
      cb(null, build);
    }
  });
};

BuildSchema.methods.updateErroredContextVersion = function (contextVersionId, cb) {
  var build = this;
  build.update({
    $set: {
      erroredContextVersion: contextVersionId
    }
  }, cb); // FIXME: rollbar error here
};

var Build = module.exports = mongoose.model('Builds', BuildSchema);