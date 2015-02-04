'use strict';
var fs    = require('fs');
var async = require('async');
var GitHubAPI = require('models/apis/github');
var Instance = require('models/mongo/instance');
var debug = require('debug')('runnable-notifications:github');
var Handlebars = require('handlebars');
var noop = require('101/noop');
var pluck = require('101/pluck');
var formatArgs = require('format-args');
var toSentence = require('underscore.string/toSentence');

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
  debug('notifyOnGitHubPullRequest', formatArgs(arguments));
  cb = cb || noop;
  // our env parsing cannot parse boolean correctly atm
  if (process.env.ENABLE_GITHUB_PR_COMMENTS !== 'true') {
    return cb(null, []);
  }
  var message = this._renderMessage(gitInfo, instances);
  // ensure org membership
  async.series([
    this._ensureOrgInvitationAccepted.bind(this, gitInfo.org.login),
    this.github.addComment.bind(this.github, gitInfo.repo, gitInfo.number, message)
    ], cb);
};

// Update PR's comment
GitHub.prototype.updatePullRequestsComments = function (instance, origInstance, cb) {
  debug('updatePullRequestsComments', formatArgs(arguments));
  cb = cb || noop;
  // our env parsing cannot parse boolean correctly atm
  if (process.env.ENABLE_GITHUB_PR_COMMENTS !== 'true') {
    return cb(null, []);
  }
  // we don't want to fetch origiInstance owner
  // and we know for sure that owner for two instances is the same
  origInstance.owner = instance.owner;
  async.series([
    this._updatePullRequestsComments.bind(this, instance),
    this._updatePullRequestsComments.bind(this, origInstance)
  ], cb);
};


GitHub.prototype.deletePullRequestComment = function (gitInfo, cb) {
  debug('deletePullRequestComment', formatArgs(arguments));
  cb = cb || noop;
  var self = this;
  this.github.findCommentByUser(gitInfo.repo, gitInfo.number, process.env.RUNNABOT_GITHUB_USERNAME,
    function (err, comment) {
      if (err || !comment) {
        return cb(err, null);
      }
      self.github.deleteComment(gitInfo.repo, comment.id, cb);
    });
};


GitHub.prototype._ensureOrgInvitationAccepted = function (orgName, callback) {
  debug('_ensureOrgInvitationAccepted', formatArgs(arguments));
  if (!orgName) {
    return callback(null);
  }
  var self = this;
  this.github.user.getOrgMembership({org: orgName}, function (err, membership) {
    if (err) { return callback(err); }
    if (membership && membership.state !== 'pending') {
      return callback(null);
    }
    self.github.user.updateOrgMembership({org: orgName, state: 'active'}, callback);
  });
};

GitHub.prototype._updatePullRequestsComments = function (instance, cb) {
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
      async.map(ids, function (number, callback) {
        self.github.findCommentByUser(shortRepo, number, process.env.RUNNABOT_GITHUB_USERNAME,
          function (err, comment) {
            if (err) {
              return callback(err);
            }
            if (comment) {
              var oldMessage = comment.body;
              var gitInfo = {
                owner: {
                  login: instance.owner.login || instance.owner.username
                },
                number: number,
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
  if (instances && instances.length > 0) {
    var message;
    if (instances.length === 1) {
      message = renderServerLink(gitInfo, instances[0]) + ' is';
    }
    else {
      var links = instances.map(renderServerLink.bind(null, gitInfo));
      message = toSentence(links, ', ', ' and ') + ' are';
    }
    return message + ' updated with the latest changes to PR-' + gitInfo.number + '.';
  }
  else {
    gitInfo.domain = process.env.DOMAIN;
    return chooseServerTpl(gitInfo).trim();
  }
};

function renderServerLink (gitInfo, instance) {
  var data = {
    domain: process.env.DOMAIN,
    name: instance.name,
    owner: {
      login: gitInfo.owner.login
    }
  };
  return serverLinkTpl(data);
}

function createTpl (tplPath) {
  var content = fs.readFileSync(tplPath, {encoding: 'utf8'});
  return Handlebars.compile(content);
}

module.exports = GitHub;