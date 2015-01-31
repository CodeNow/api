'use strict';
var fs    = require('fs');
var async = require('async');
var GitHubAPI = require('models/apis/github');
var Instance = require('models/mongo/instance');
var debug = require('debug')('runnable-notifications:github');
var Handlebars = require('handlebars');
var noop = require('101/noop');
var pluck = require('101/pluck');

Handlebars.registerHelper('encode', function (str) {
  // we do double encoding here for angular because
  // browser would automatically replace `%2F` to `/` and angular router will fail
  return encodeURIComponent(encodeURIComponent(str));
});

var chooseServerTpl;
var serverLinkTpl;

function GitHub () {
  this.github = new GitHubAPI({token: process.env.RUNNABOT_GITHUB_ACCESS_TOKEN});
  if (!chooseServerTpl) {
    chooseServerTpl = createTpl('./templates/github_pull_request_choose_server.hbs');
  }
  if (!serverLinkTpl) {
    serverLinkTpl = createTpl('./templates/github_pull_request_server_link.hbs');
  }
}

// Notify when PR was created
GitHub.prototype.notifyOnPullRequest = function (gitInfo, instances, cb) {
  debug('notifyOnGitHubPullRequest', gitInfo, instances);
  // our env parsing cannot parse boolean correctly atm
  if (process.env.ENABLE_GITHUB_PR_COMMENTS !== 'true') {
    return cb(null, []);
  }
  cb = cb || noop;
  var message = this._renderMessage(gitInfo, instances);
  // ensure org membership

  async.series([
    this._ensureOrgInvitationAccepted.bind(this, gitInfo.owner.login),
    this.github.addComment.bind(this.github, gitInfo.repo, gitInfo.number, message)
    ], cb);
};

// Update PR's comment
GitHub.prototype.updatePullRequestsComments = function (instance, origInstance, cb) {
  debug('updatePullRequestsComments', instance, origInstance);
  // our env parsing cannot parse boolean correctly atm
  if (process.env.ENABLE_GITHUB_PR_COMMENTS !== 'true') {
    return cb(null, []);
  }
  cb = cb || noop;
  // we don't want to fetch origiInstance owner
  // and we know for sure that owner for two instances is the same
  origInstance.owner = instance.owner;
  async.series([
    this._updatePullRequestComments.bind(this, instance),
    this._updatePullRequestComments.bind(this, origInstance)
  ], cb);
};


GitHub.prototype.deletePullRequestComment = function (gitInfo, callback) {
  debug('deletePullRequestComment', gitInfo);
  var self = this;
  this.github.findCommentByUser(gitInfo.repo, gitInfo.number, process.env.RUNNABOT_GITHUB_USERNAME,
    function (err, comment) {
      if (err) {
        return callback(err);
      }
      if (comment) {
        self.github.deleteComment(gitInfo.repo, comment.id, callback);
      }
      else {
        callback(null);
      }
    });
};


GitHub.prototype._ensureOrgInvitationAccepted = function (githubUsername, callback) {
  debug('_ensureOrgInvitationAccepted', githubUsername);
  var self = this;
  this.github.getUserByUsername(githubUsername, function (err, user) {
    if (err) { return callback(err); }
    if (user.type !== 'Organization') {
      return callback();
    }
    self.github.user.getOrgMembership({org: githubUsername}, function (err, membership) {
      if (err) { return callback(err); }
      if (membership.state !== 'pending') {
        return callback(null);
      }
      self.github.user.updateOrgMembership({org: githubUsername, state: 'active'}, callback);
    });
  });
};

GitHub.prototype._updatePullRequestComments = function (instance, cb) {
  var self = this;
  var shortRepo = instance.contextVersion.appCodeVersions[0].lowerRepo;
  var branch = instance.contextVersion.appCodeVersions[0].lowerBranch;
  Instance.findInstancesLinkedToBranch(shortRepo, branch, function(err, instances) {
    if (err) { return cb(err); }
    self.github.listOpenPullRequestsForBranch(shortRepo, branch, function (err, prs) {
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
                number: prId,
                repoName: shortRepo,
                branch: branch
              };
              var newMessage = self._renderMessage(gitInfo, instances);
              if (newMessage === oldMessage) {
                return callback(null);
              }
              self.github.updateComment(shortRepo, comment.id, newMessage, callback);
            } else {
              callback(null);
            }
          });
      }, cb);
    });
  });
};

GitHub.prototype._renderMessage = function (gitInfo, instances) {
  gitInfo.domain = process.env.DOMAIN;
  if (instances && instances.length > 0) {
    if (instances.length === 1) {
      var message = renderServerLink(gitInfo, instances[0]);
      return message + ' is updated with the latest changes to PR-' + gitInfo.number + '.';
    }
    else {
      var links = instances.map(renderServerLink.bind(null, gitInfo));
      var text = links.reduce(function (prev, curr, index) {
        if (index === 0) {
          return curr;
        }
        if (index < (links.length - 1)) {
          return prev + ', ' + curr;
        }
        else {
          return prev + ' and '  + curr;
        }
      }, links[0]);
      return text + ' are updated with the latest changes to PR-' + gitInfo.number + '.';
    }
  }
  else {
    return chooseServerTpl(gitInfo).trim();
  }
};

function renderServerLink (gitInfo, instance) {
  gitInfo.name = instance.name;
  gitInfo.owner = gitInfo.owner || instance.owner;
  gitInfo.owner.login = instance.owner.login || instance.owner.username;
  return serverLinkTpl(gitInfo);
}

function createTpl (tplPath) {
  var content = fs.readFileSync(tplPath, {encoding: 'utf8'});
  return Handlebars.compile(content);
}

module.exports = GitHub;