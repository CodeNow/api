'use strict';
require('loadenv')();
// redis is required for hosts and hipache-entry to work (below)
require('models/redis/index');
var async = require('async');
var User = require('models/mongo/user');
var Instance = require('models/mongo/instance');
var mongoose = require('models/mongo/mongoose-control');

var githubIdToUsername = {};
var populateHandlers = {};

var dryRun = !process.env.ACTUALLY_RUN;
console.log('dryRun?', dryRun);

// Connect to mongo
mongoose.start(function (err) {
  if (err) { throw err; }
  // Find all instances
  Instance.find({ }, function (err, instances) {
    if (err) { throw err; }
    // Reset deps for instances task
    async.eachLimit(instances, 100, function (instance, cb) {
      // Find ownerUsername
      findInstanceOwnerUsername(function (err, ownerUsername) {
        if (err) { return log(err, instance, cb); }
        // Reset deps for instance from env
        if (dryRun) {
          console.log('Dry Run Info:');
          console.log('Instance Id', instance._id);
          console.log('setDependenciesFromEnvironment', ownerUsername);
        }
        instance.setDependenciesFromEnvironment(ownerUsername, function (err) {
          if (err) { return log(err, instance, cb); }

          console.log('Success w/ '+instance._id);
          cb();
        });
      });
    }, done);
  });
});

function findInstanceOwnerUsername (instance, cb) {
  User.findOneBy('accounts.github.id', instance.createdBy.github, function (err, creator) {
    if (err) { return cb(err); }
    if (!creator) {
      err = new Error('creator not found');
      return cb(err);
    }

    var ownerGithubId = instance.owner.github;
    checkGithubUsernameCache(ownerGithubId, cb);
    instance.populateOwnerAndCreatedBy(creator, handlePopulate);
    function handlePopulate (err, instance) {
      populateHandlers[ownerGithubId].forEach(function (handler) {
        handler(err, instance);
      });
      if (instance) {
        githubIdToUsername[ownerGithubId] = instance.owner.github;
      }
    }
  });
}

function checkGithubUsernameCache (githubId, cb) {
  var ownerUsername = githubIdToUsername[githubId];
  if (ownerUsername) {
    return cb(null, ownerUsername);
  }
  if (populateHandlers) {
    populateHandlers.push(cb);
  }
  else {
    populateHandlers = [ cb ];
  }
}

function log (err, instance, cb) {
  console.error('');
  console.error('Error w/ ' + instance._id);
  console.error(err.stack);
  console.error('');
  cb();
}

function done (err) {
  if (err) {
    throw err;
  }
  mongoose.stop(function () {
    console.log('DONE!!!');
  });
}