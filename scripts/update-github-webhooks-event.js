'use strict';
require('loadenv')();

var async = require('async');
var request = require('request');
var debug = require('debug')('script');
var Instance = require('models/mongo/instance');
var GitHub = require('models/apis/github');
var ContextVersion = require('models/mongo/context-version');
var User = require('models/mongo/user');
var mongoose = require('mongoose');
mongoose.connect(process.env.MONGO);


function findAllRepos(cb) {
  ContextVersion.findAllRepos(cb);
}


var allErrors = [];

function findUsersForRepos(repos, cb) {
  debug('findUsersForRepos', 'total repos num:', repos.length);
  async.map(repos, function (repo, callback) {
    User.findByGithubId(repo.creators[0], function (err, user) {
      if (err) { return callback(err); }
      repo.user = user;
      if (!user) {
        if (!repo.creators[1]) {
          return callback(null, repo);
        }
        User.findByGithubId(repo.creators[1], function (err, user) {
          if (err) { return callback(err); }
          repo.user = user;
          if (!user) {
            if (!repo.creators[2]) {
              return callback(null, repo);
            }
            User.findByGithubId(repo.creators[2], function (err, user) {
              if (err) { return callback(err); }
              repo.user = user;
              callback(null, repo);
            });
          } else {
            callback(null, repo);
          }
        });
      } else {
        callback(null, repo);
      }
    });
  }, cb);
}


function updateHooksEvents(repos, cb) {
  debug('updateHooksEvents', 'total repos num:', repos.length);
  async.mapLimit(repos, 50, function(repo, callback) {
    console.log('processing repo', repo);
    if (!repo.user) {
      console.log('user not found for the repo', repo);
      return callback();
    }
    var github = new GitHub({token: repo.user.accounts.github.accessToken});
    // this will actually update hook (not just create if missing)
    github.createRepoHookIfNotAlready(repo._id, function (err) {
      if (err) {
        allErrors.push(err);
        if(err.output.statusCode === 404) {
          console.log('repos not found. just skip it', repo);
          callback(null);
        } else if(err.output.statusCode === 502) {
          console.log('access token removed. just skip it', repo);
          callback(null);
        } else {
          callback(err);
        }
      }
      callback(null);
    });
  }, cb);
}

function finish (err, results) {
  console.log('DONE: err?', err);
  console.log('all errors', allErrors);
  process.exit();
}
async.waterfall([
  findAllRepos,
  findUsersForRepos,
  updateHooksEvents
], finish);