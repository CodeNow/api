'use strict';

var mongoose = require('mongoose');
var Boom = require('dat-middleware').Boom;
var debug = require('debug')('runnable-api:build:model');
var BuildSchema = require('models/mongo/schemas/build');

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

BuildSchema.methods.setInProgress = function (cb) {
  var build = this;
  if (build.started) {
    cb(Boom.badRequest('Build is already in progress'));
  }
  else if (build.completed) {
    cb(Boom.badRequest('Build has already completed'));
  }
  Build.findAndModify({
    _id: build._id,
    started: { $exists: false }
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