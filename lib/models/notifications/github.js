'use strict';
var fs    = require('fs');
var async = require('async');
var GitHubAPI = require('models/apis/github');
var debug = require('debug')('runnable-notifications:github');
var Handlebars = require('handlebars');
var noop = require('101/noop');
var pluck = require('101/pluck');

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

// Notify when PR was created
GitHub.prototype.notifyOnPullRequest = function (githubPushInfo, instances, cb) {
  debug('notifyOnGitHubPullRequest', githubPushInfo, instances);
  cb = cb || noop;
  var message = this._renderMessage(githubPushInfo, instances);
  this.github.addComment(githubPushInfo.repo, githubPushInfo.number, message, cb);
};

// Update PR's comment
GitHub.prototype.updatePullRequestComment = function (instance, cb) {
  debug('updatePullRequestComment', instance);
  console.log('update pull request comment', instance);
  cb = cb || noop;
  var self = this;
  var shortRepo = instance.contextVersion.appCodeVersions[0].lowerRepo;
  var branch = instance.contextVersion.appCodeVersions[0].branch;
  this.github.listOpenPullRequestsForBranch(shortRepo, branch, function (err, prs) {
    if (err) {
      return cb(err);
    }
    var ids = prs.map(pluck('id'));
    // var message = this._renderMessage({owner: instance.owner}, [instance]);
    async.map(ids, function (prId, callback) {
      self.github.findCommentByUser(shortRepo, prId, process.env.RUNNABOT_GITHUB_ID,
        function (err, comment) {
          if (err) {
            return callback(err);
          }
          console.log('update comment', comment);
          cb(null);
        });

    }, function (err, results) {
      console.log('updatePullRequestComment result', err, results);
      cb(err, results);
    });

  });

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