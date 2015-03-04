'use strict';

var ContextVersion = require('models/mongo/context-version');

module.exports = {
  complete: waitForBuildComplete,
  error   : waitForBuildError
};

/**
 * waits for a context version to complete building by polling mongo
 * @param  {object|string} cvId contextVersion json or contextVersion id string
 * @param  {Function} cb   callback
 */
function waitForBuildComplete (cvId, cb) {
  cvId = cvId._id ? cvId._id : cvId;
  ContextVersion.findById(cvId, function (err, cv) {
    if (err) { return cb(err); }
    if (cv.build.completed) {
      return cb(null, cv.toJSON());
    }
    setTimeout(waitForBuildComplete.bind(null, cvId, cb), 50);
  });
}
function waitForBuildError (cvId, cb) {
  ContextVersion.findById(cvId, function (err, cv) {
    if (err) { return cb(err); }
    if (cv.build.failed) {
      cb(null, cv);
    }
    else {
      if (cv.build.completed) {
        return cb(new Error('context version built successfully (expected error)'));
      }
      setTimeout(waitForBuildComplete.bind(null, cvId, cb), 50);
    }
  });
}