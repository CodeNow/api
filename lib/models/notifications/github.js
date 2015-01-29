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
GitHub.prototype.updatePullRequestsComments = function (instance, origInstance, cb) {
  debug('updatePullRequestsComments', instance, origInstance);
  cb = cb || noop;
  // we don't want to fetch origiInstance owner
  // and we know for sure that owner for two instances is the same
  origInstance.owner = instance.owner;
  async.series([
    this._updatePullRequestComments.bind(this, instance,
      this._newMessageForLinkedBox.bind(this)),
    this._updatePullRequestComments.bind(this, origInstance,
      this._newMessageForUnlinkedBox.bind(this))
  ], cb);
};

GitHub.prototype._updatePullRequestComments = function (instance, transformComment, cb) {
  var self = this;
  var shortRepo = instance.contextVersion.appCodeVersions[0].lowerRepo;
  var branch = instance.contextVersion.appCodeVersions[0].lowerBranch;
  this.github.listOpenPullRequestsForBranch(shortRepo, branch, function (err, prs) {
    if (err) {
      return cb(err);
    }
    if (!prs) {
      return cb(null);
    }
    var ids = prs.map(pluck('number'));
    async.map(ids, function (prId, callback) {
      self.github.findCommentByUser(shortRepo, prId, process.env.RUNNABOT_GITHUB_USERNAME,
        function (err, comment) {
          if (err) {
            return callback(err);
          }
          if (comment) {
            var oldMessage = comment.body;
            var gitInfo = {
              owner: {
                login: instance.owner.username
              },
              repoName: shortRepo,
              branch: branch
            };
            var newMessage = transformComment(gitInfo, oldMessage, instance);
            if (!newMessage) {
              return callback(null);
            }
            self.github.updateComment(shortRepo, comment.id, newMessage, callback);
          } else {
            callback(null);
          }
        });
    }, cb);
  });
};

GitHub.prototype._newMessageForLinkedBox = function (gitInfo, oldMessage, instance) {
  var newMessage = this._renderMessage(gitInfo, [instance]);
  if (oldMessage === newMessage) {
    return null;
  }
  if (oldMessage.indexOf('/' + gitInfo.owner.login + '/boxSelection/') < 0) {
    newMessage = oldMessage + '\n' + newMessage;
  }
  return newMessage;
};

GitHub.prototype._newMessageForUnlinkedBox = function (gitInfo, oldMessage, instance) {
  var serverLinkMessage = this._renderMessage(gitInfo, [instance]);
  var boxSelectionMessage = this._renderMessage(gitInfo);
  var newMessage = oldMessage.replace(serverLinkMessage, '').trim();
  if (newMessage.length === 0) {
    newMessage = boxSelectionMessage;
  }
  return newMessage;
};

GitHub.prototype._renderMessage = function (githubPushInfo, instances) {
  githubPushInfo.domain = process.env.DOMAIN;
  githubPushInfo.instances = instances;
  return onGitHubPullRequestTpl(githubPushInfo).trim();
};

function createTpl (tplPath) {
  var content = fs.readFileSync(tplPath, {encoding: 'utf8'});
  return Handlebars.compile(content);
}

module.exports = GitHub;