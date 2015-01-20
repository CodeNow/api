'use strict';

var mongoose = require('mongoose');
var async = require('async');
var Boom = require('dat-middleware').Boom;
var debug = require('debug')('runnable-api:build:model');
var BuildSchema = require('models/mongo/schemas/build');
var BuildCounter = require('models/mongo/build-counter');
var pluck = require('101/pluck');
var omit = require('101/omit');

BuildSchema.statics.findLatestBuildsWithContextVersions = function (contextVersions, cb) {
  debug('starting to aggregate for builds by contextVersions');
  var Build = this;
  var contextVersionIds = contextVersions.map(pluck('_id'));
  Build.aggregate()
    .match({
      contextVersions: { $in: contextVersionIds },
      started: { $exists: true },
      disabled: { $exists: false }
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

/**
 * create a shallow copy of a build - keeps same infra and appCode
 * @param  {Object}   props props to set on the build
 * @param  {Function} cb    callback(err, newBuild)
 */
var fieldsToOmit = [
  '_id',
  'created',
  'createdBy',
];
BuildSchema.methods.shallowCopy = function (props, cb) {
  var build = this;
  var buildData;
  // ugly-ish, but needed for omit to work correctly
  try {
    buildData = build.toJSON();
  } catch (e) {
    return cb(e);
  }
  var newBuild = new Build(omit(buildData, fieldsToOmit));
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

BuildSchema.methods.modifyErrored = function (contextVersionId, cb) {
  var now = Date.now();
  Build.findByIdAndUpdate(this._id, {
    $set: {
      failed: true,
      completed: now,
      duration: now - this.started
    },
    $push: {
      erroredContextVersions: contextVersionId
    }
  }, cb);
};

BuildSchema.methods.modifyCompleted = function (cb) {
  var now = Date.now();
  Build.findByIdAndUpdate(this._id, {
    $set: {
      completed: now,
      duration: now - this.started
    }
  }, cb);
};

/**
 * updateContextVersions with the ones provided if they don't match
 * @param {ContextVersionModel} cV contextVersion model to be replace
 * @param {ContextVersionModel} cV2 contextVersion model to replace cV with
 * @param {callback} cb  cb(err, build)
 */
BuildSchema.methods.replaceContextVersion = function (cV, cV2, cb) {
  if (cV._id.toString() === cV2._id.toString()) {
    return cb(null, this);
  }
  var query = {
    _id: this._id,
    contextVersions: cV._id.toString()
  };
  var update = {
    $set: {
      'contextVersions.$': cV2._id.toString()
    }
  };
  var self = this;
  Build.update(query, update, function (err) {
    if (err) { return cb(err); }
    Build.findById(self._id, cb);
  });
};

var Build = module.exports = mongoose.model('Builds', BuildSchema);
