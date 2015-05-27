'use strict';
require('loadenv')();
// redis is required for hosts and hipache-entry to work (below)
require('models/redis/index');
var async = require('async');
var User = require('models/mongo/user');
var Instance = require('models/mongo/instance');
var mongoose = require('models/mongo/mongoose-control');

var githubIdToUsername = {};
var populateHandlersMap = {};

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
      findInstanceOwnerUsername(instance, function (err, ownerUsername) {
        if (err) { return log(err, instance, cb); }
        // Reset deps for instance from env
        if (dryRun) {
          console.log('Dry Run Success:');
          console.log('Instance Id', instance._id);
          console.log('setDependenciesFromEnvironment', ownerUsername);
          return cb();
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
    var cacheHit = checkGithubUsernameCache(ownerGithubId, cb);
    if (!cacheHit) {
      instance.populateOwnerAndCreatedBy(creator, handlePopulate);
    }
    function handlePopulate (err, instance) {
      var username = instance && instance.owner.username;
      var handler;
      while(handler = populateHandlersMap[ownerGithubId].pop()) {
        handler(err, username);
      }
      if (instance) {
        githubIdToUsername[ownerGithubId] = username;
      }
    }
  });
}

function checkGithubUsernameCache (githubId, cb) {
  var ownerUsername = githubIdToUsername[githubId];
  if (ownerUsername) {
    cb(null, ownerUsername);
    return true;
  }
  var populateHandlers = populateHandlersMap[githubId];
  if (populateHandlers) {
    populateHandlers.push(cb);
    return true;
  }
  else {
    populateHandlersMap[githubId] = [ cb ];
    return false;
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