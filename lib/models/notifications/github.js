'use strict';
var fs    = require('fs');
var GitHubAPI = require('models/apis/github');
var debug = require('debug')('runnable-notifications:github');
var Handlebars = require('handlebars');

Handlebars.registerHelper('encode', function (str) {
  // we do double encoding here for angular because
  // browser would automatically replace `%2F` to `/` and angular router will fail
  return encodeURIComponent(encodeURIComponent(str));
});

var onGitHubPullRequestTpl;

function GitHub () {
  this.github = new GitHubAPI({token: process.env.RUNNABOT_GITHUB_ACCESS_TOKEN});
  if (!onGitHubPullRequestTpl) {
    onGitHubPullRequestTpl = createTpl('./templates/github_on_pull_request.hbs');
  }
}

// Notify when PR was created or updated
GitHub.prototype.notifyOnPullRequest = function (githubPushInfo, instances, cb) {
  debug('notifyOnGitHubPullRequest', githubPushInfo, instances);
  var message = this._renderMessage(githubPushInfo, instances);
  this.github.addComment(githubPushInfo.repo, githubPushInfo.number, message, cb);
};

GitHub.prototype._renderMessage = function (githubPushInfo, instances) {
  githubPushInfo.domain = process.env.DOMAIN;
  githubPushInfo.instances = instances;
  return onGitHubPullRequestTpl(githubPushInfo);
};

function createTpl (tplPath) {
  var content = fs.readFileSync(tplPath, {encoding: 'utf8'});
  return Handlebars.compile(content);
}

module.exports = GitHub;