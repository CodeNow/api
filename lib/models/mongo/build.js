'use strict';

var mongoose = require('mongoose');

var debug = require('debug')('runnable-api:build:model');

var BuildSchema = require('models/mongo/schemas/build');

/** Returns the latest build for every environment containing a given context
 *  @param {context} context Context to search for
 *  @param {function} cb function (err, [list of builds indexed by environment]) */
BuildSchema.statics.findLatestBuildsForContext = function (context, cb) {
  debug('starting to aggregate for builds');
  this.aggregate()
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
var fieldsToCopy = ['project', 'environment', 'contexts', 'owner'];
BuildSchema.methods.createCopyWithClonedVersions = function (contextVersions, cb) {
  var build = this;
  var newBuild = new Build();
  newBuild.set(pick(build, fieldsToCopy));
  newBuild.created = Date.now();
  newBuild.contextVersions = contextVersions;
  newBuild.save(cb);
};


module.exports = mongoose.model('Builds', BuildSchema);
