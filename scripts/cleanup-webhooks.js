/**
Find all repos and runnable webhooks for this repo and do following:
 - if 2 webhooks exist (1 to http and 1 to https) - then remove http webhook
 - if 1 webhook exists (http) - update it to https
 - if 1 webhook exists (https) - do nothing
 - if 0 webhook exist - create https webhook

To run in test mode:

  NODE_PATH=./lib node scrtips/cleanup-webhooks.js
  and please add appropriate NODE_ENV

To run in prod mode:

  NODE_PATH=./lib ACTUALLY_RUN=1  node scrtips/cleanup-webhooks.js
  and please add appropriate NODE_ENV

*/

'use strict';
require('loadenv')();

var async = require('async');
var request = require('request');
var find = require('101/find');
var hasKeypaths = require('101/has-keypaths');
var Instance = require('models/mongo/instance');
var GitHub = require('models/apis/github');
var ContextVersion = require('models/mongo/context-version');
var User = require('models/mongo/user');
var mongoose = require('mongoose');

if (!process.env.NODE_PATH) {
  throw new Error('NODE_PATH=./lib is required');
}
if (!process.env.MONGO) {
  throw new Error('MONGO is required');
}
if (!process.env.ACTUALLY_RUN) {
  console.log('DRY RUN!');
}

mongoose.connect(process.env.MONGO);


function findAllRepos(cb) {
  ContextVersion.findAllRepos(cb);
}


var dryRun = !process.env.ACTUALLY_RUN;


var allErrors = [];


function findUser (users, cb) {
  var user;
  var count = 0;
  async.whilst(
    function () { return count < users.length; },
    function (callback) {
      var userId = users[count];
      User.findByGithubId(userId, function (err, gitHubUser) {
        count++;
        if (gitHubUser) {
          // force finish
          user = gitHubUser;
          count = users.length;
        }
        callback();
      });
    },
    function (err) {
      if (err) {
        return cb(err);
      }
      cb(null, user);
    }
  );
}


function findUsersForRepos(repos, cb) {
  console.log('findUsersForRepos', 'total repos num:', repos.length);
  async.map(repos, function (repo, callback) {
    findUser(repo.creators, function (err, user) {
      if (err) { return callback(err); }
      repo.user = user;
      callback(null, repo);
    });
  }, cb);
}


function processHooks(repos, cb) {
  console.log('processHooks', 'total repos num:', repos.length);
  async.mapLimit(repos, 50, function(repo, callback) {

    var errorHandler = function (err) {
      if (err) {
        allErrors.push(err);
        if(err.output.statusCode === 404) {
          console.log('repos not found. just skip it', repo);
          callback(null);
        }
        else if(err.output.statusCode === 502) {
          console.log('access token removed. just skip it', repo);
          callback(null);
        }
        else {
          callback(err);
        }
      }
      else {
        callback(null);
      }
    };

    console.log('processing repo', repo);
    if (!repo.user) {
      console.log('user not found for the repo', repo);
      return callback();
    }
    var github = new GitHub({token: repo.user.accounts.github.accessToken});
    github._listRepoHooks(repo._id, function (err, hooks) {
      if (err) {
        return errorHandler(err);
      }
      hooks = hooks || [];
      var hookUrl = process.env.FULL_API_DOMAIN + process.env.GITHUB_HOOK_PATH;
      var httpsHook = find(hooks, hasKeypaths({
        'config.url': hookUrl
      }));
      var httpHook = find(hooks, hasKeypaths({
        'config.url': hookUrl.replace('https', 'http')
      }));
      // case 1
      if (httpHook && httpsHook) {
        if (dryRun) {
          console.log('going to delete hook', repo, httpHook._id);
          return callback();
        } else {
          return github._deleteRepoHook(httpHook._id, errorHandler);
        }
      }
      // case 2
      if (httpHook) {
        if (dryRun) {
          console.log('going to update hook', repo, httpHook._id);
          return callback();
        } else {
          return github._updateRepoHook(httpHook.id, repo._id, errorHandler);
        }
      }
      // case 3
      if (httpsHook) {
        console.log('going to do nothing. everything is fine for repo', repo);
        return callback(null);
      }
      // case 4
      if (dryRun) {
        console.log('going create new hook', repo);
        return callback();
      } else {
        github.createRepoHookIfNotAlready(repo._id, errorHandler);
      }
    });
  }, cb);
}

function finish (err) {
  console.log('DONE: err?', err);
  console.log('all errors', allErrors);
  process.exit();
}
async.waterfall([
  findAllRepos,
  findUsersForRepos,
  processHooks
], finish);
