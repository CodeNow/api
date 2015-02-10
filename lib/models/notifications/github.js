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
var Boom = require('dat-middleware').Boom;

Handlebars.registerHelper('encode', function (str) {
  // we do double encoding here for angular because
  // browser would automatically replace `%2F` to `/` and angular router will fail
  return encodeURIComponent(encodeURIComponent(str));
});

var chooseServerTpl = createTpl('./templates/github_pull_request_choose_server.hbs');
var serverLinkTpl = createTpl('./templates/github_pull_request_server_link.hbs');

function GitHub () {
  this.github = new GitHubAPI({token: process.env.RUNNABOT_GITHUB_ACCESS_TOKEN});
}

// Notify when PR was created
GitHub.prototype.notifyOnPullRequest = function (gitInfo, instances, cb) {
  debug('notifyOnGitHubPullRequest', formatArgs(arguments));
  cb = cb || noop;
  // our env parsing cannot parse boolean correctly atm
  if (process.env.ENABLE_GITHUB_PR_COMMENTS !== 'true') {
    return cb(null);
  }
  var message = this._renderMessage(gitInfo, instances);
  // ensure org membership
  async.series([
    this._ensurePermissions.bind(this, gitInfo.repo, gitInfo.org.login),
    this.github.addComment.bind(this.github, gitInfo.repo, gitInfo.number, message)
    ], cb);
};

// Update PR's comment
GitHub.prototype.updatePullRequestsComments = function (instance, origInstance, cb) {
  debug('updatePullRequestsComments', formatArgs(arguments));
  cb = cb || noop;
  // our env parsing cannot parse boolean correctly atm
  if (process.env.ENABLE_GITHUB_PR_COMMENTS !== 'true') {
    return cb(null);
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
  // our env parsing cannot parse boolean correctly atm
  if (process.env.ENABLE_GITHUB_PR_COMMENTS !== 'true') {
    return cb(null);
  }
  var self = this;
  this.github.findCommentByUser(gitInfo.repo, gitInfo.number, process.env.RUNNABOT_GITHUB_USERNAME,
    function (err, comment) {
      if (err || !comment) {
        return cb(err, null);
      }
      self.github.deleteComment(gitInfo.repo, comment.id, cb);
    });
};

// this method will check if runnabot has proper permissions for the repo.
// there are 4 main cases:
// 1. repo owner is user and repo is public.
// 2. repo owner is user and repo is private.
// Check if runnabot is collaborator for the repo.
// 3. repo owner is org and repo is public.
// 4. repo owner is org and repo is private.
// Check if runnabot is org member and invitation is accepted.
GitHub.prototype._ensurePermissions = function (shortRepo, orgName, callback) {
  debug('_ensurePermissions', formatArgs(arguments));
  var self = this;

  self.github.isPublicRepo(shortRepo, function (err, isPublic) {
    console.log('is public', err, isPublic, shortRepo, orgName);
    if (err) { return callback(err); }
    // case 1, 3
    if (isPublic) {
      return callback(null);
    }
    // case 4
    if (orgName) {
      // case 4
      self.github.isOrgMember(orgName, function (err, isMember) {
        if (err) { return callback(err); }
        if (isMember) {
          return callback(null);
        }
        // user can have pending membership in the org:
        // e.x. invitation was sent but not accepted yet.
        // by setting `state` to `active` we are trying to accept membership.
        self.github.user.updateOrgMembership({org: orgName, state: 'active'}, callback);
      });
    }
    // case 2
    else {
      // case 2
      self.github.isCollaborator(shortRepo, process.env.RUNNABOT_GITHUB_USERNAME,
        function (err, isCollaborator) {
          console.log('is coll', err, isCollaborator, shortRepo, orgName);
          if (err) { return callback(err); }
          if (isCollaborator) {
            return callback(null);
          }
          callback(Boom.forbidden('Runnabot is not collaborator on a private repo: ' + shortRepo));
        });
    }
  });
};

GitHub.prototype._updatePullRequestsComments = function (instance, cb) {
  debug('_updatePullRequestsComments', formatArgs(arguments));
  if (!instance) {
    return cb(null);
  }
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