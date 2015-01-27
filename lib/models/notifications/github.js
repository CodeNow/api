'use strict';
var util  = require('util');
var Notifier = require('./notifier');
var GitHubAPI = require('models/apis/github');
var debug = require('debug')('runnable-notifications:github');

function GitHub (settings) {
  Notifier.call(this, 'github', settings);
  this.github = new GitHubAPI({token: process.env.RUNNABOT_GITHUB_ACCESS_TOKEN});
}

// Notify when PR was created or updated
Notifier.prototype.notifyOnGitHubPullRequest = function (githubPushInfo, instances, cb) {
  debug('notifyOnGitHubPullRequest', githubPushInfo, instances);
  this.github.addComment(githubPushInfo.repo, githubPushInfo.number, 'some text', cb);
};


util.inherits(GitHub, Notifier);




module.exports = GitHub;