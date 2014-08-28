'use strict';

var mongoose = require('mongoose');
var async = require('async');
var Boom = require('dat-middleware').Boom;
var debug = require('debug')('runnable-api:build:model');
var BuildSchema = require('models/mongo/schemas/build');
var BuildCounter = require('models/mongo/build-counter');
var pick = require('101/pick');
var pluck = require('101/pluck');
var findIndex = require('101/find-index');
var isFunction = require('101/is-function');

BuildSchema.statics.findPopulated = function (user /* [, query][, fields][, opts][, cb] */) {
  var args = Array.prototype.slice.call(arguments);
  var cbIndex = findIndex(args, isFunction);
  var findArgs = args.slice(1, cbIndex);
  var cb = args[cbIndex];
  var Build = this;
  Build
    .find.apply(Build, findArgs)
    .populate('contextVersions')
    .exec(function (err, builds) {
      if (err) { return cb(err); }
      async.map(builds, function (build, mapCb) {
        async.forEach(build.contextVersions, function (contextVersion, eachCb) {
          contextVersion.getTriggeredByUsername(user, eachCb);
        }, function (err) {
          mapCb(err, build);
        });
      }, cb);
    });
};

BuildSchema.statics.findOnePopulated = function (user /* [, query][, fields][, opts][, cb] */) {
  var args = Array.prototype.slice.call(arguments);
  var cbIndex = findIndex(args, isFunction);
  var findArgs = args.slice(1, cbIndex);
  var cb = args[cbIndex];
  var Build = this;
  Build
    .findOne.apply(Build, findArgs)
    .populate('contextVersions')
    .exec(function (err, build) {
      if (err) {
        cb(err);
      } else if (!build) {
        cb(Boom.notFound('Build not found'));
      } else if (build.contextVersions.length === 0) {
        cb(err, build);
      } else {
        // FIXME: if this build has a contextVersion triggeredBy a github hook
        // technically we should update the usernames of the committers in the
        // commit log
        build.contextVersions[0].getTriggeredByUsername(user, function (err) {
          cb(err, build);
        });
      }
    });
};

BuildSchema.statics.findLatestBuildsWithContextVersions = function (contextVersions, cb) {
  debug('starting to aggregate for builds by contextVersions');
  var Build = this;
  var contextVersionIds = contextVersions.map(pluck('_id'));
  Build.aggregate()
    .match({
      contextVersions: { $in: contextVersionIds },
      started: { $exists: true }
    })
    .sort({
      'created': 'asc'
    })
    .group({
      _id: '$environment',
      buildId: { $last: '$_id' }
    })
    .exec(function (err, buildInfos) {
      if (err) { return cb(err); }
      // now make sure the builds are the latest builds...
      // (no builds in the environment using a different cv)
      Build.filterBuildInfosByLatest(buildInfos, function (err, latestBuildInfos) {
        if (err) { return cb(err); }

        var buildIds = latestBuildInfos.map(pluck('buildId'));
        Build.findByIds(buildIds, cb);
      });
    });
};

// this is to filter out build lists who do not rely on the given context version (github branch)
// from the previous aggregation
BuildSchema.statics.filterBuildInfosByLatest = function (buildInfos, cb) {
  var Build = this;
  async.filter(buildInfos, function (buildInfo, acb) {
    var environmentId = buildInfo._id;
    var buildId = buildInfo.buildId;

    Build
      .find({
        environment: environmentId,
        started: { $exists: true }
      })
      .sort({
        'created': 'desc'
      })
      .limit(1)
      .exec(function (err, builds) {
        if (err) {
          cb(err); // main callback, async.filter doesn't handle errs
          cb = function () {};
        }
        else {
          acb(builds[0]._id.toString() === buildId.toString());
        }
      });
  }, function (buildInfos) {
    cb(null, buildInfos);
  });
};

var fieldsToCopy = ['environment', 'contexts'];
BuildSchema.methods.createCopy = function (props, cb) {
  var build = this;
  var newBuild = new Build(pick(build, fieldsToCopy));
  newBuild.set(props);
  newBuild.save(cb);
};


BuildSchema.methods.setInProgress = function (user, cb) {
  var build = this;
  if (build.started) {
    cb(Boom.conflict('Build is already in progress'));
  }
  else if (build.completed) {
    cb(Boom.conflict('Build has already completed'));
  }
  BuildCounter.next(build.environment, function(err, buildNumber) {
    if (err) {
      cb(err);
    } else {
      Build.findOneAndUpdate({
        _id: build._id,
        started: { $exists: false }
      }, {
        $set: {
          buildNumber: buildNumber,
          started: Date.now()
        }
      }, function (err, build) {
        if (err) {
          cb(err);
        } else if (!build) {
          cb(Boom.conflict('Build is already in progress'));
        } else {
          cb(null, build);
        }
      });
    }
  });

};

BuildSchema.methods.pushErroredContextVersion = function (contextVersionId, cb) {
  var build = this;
  build.update({
    $set: {
      failed: true
    },
    $push: {
      erroredContextVersions: contextVersionId
    }
  }, cb); // FIXME: rollbar error here
};

BuildSchema.methods.setCompleted = function (cb) {
  var now = Date.now();
  this.update({
    $set: {
      completed: now,
      duration: now - this.started
    }
  }, cb);
};

var Build = module.exports = mongoose.model('Builds', BuildSchema);
