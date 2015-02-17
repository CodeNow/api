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


function findUsersForRepos(repos, cb) {
  debug('findUsersForRepos', 'total repos num:', repos.length);
  async.map(repos, function (repo, callback) {
    User.findByGithubId(repo.creators[0], function (err, user) {
      if (err) { return callback(err); }
      repo.user = user;
      callback(null, repo);
    });
  }, cb);
}


function updateHooksEvents(repos, cb) {
  debug('updateHooksEvents', 'total repos num:', repos.length);
  async.mapLimit(repos, function(repo, callback) {
    var github = new GitHub({token: repo.user.accounts.github.accessToken});
    // this will actually update hook (not just create if missing)
    github.createRepoHookIfNotAlready(repo._id, function (err, result) {
      if (err) {
        console.log('failed to update webhook for:', repo, '; error: ', err);
      }
      callback(null, result);
    });
  }, 10, cb);
}

function finish (err, results) {
  console.log('DONE: err?', err);
  console.log('all results', results);
  process.exit();
}
async.waterfall([
  findAllRepos,
  findUsersForRepos,
  updateHooksEvents
], finish);