'use strict';
var fs    = require('fs');
var async = require('async');
var GitHubAPI = require('models/apis/github');
var Instance = require('models/mongo/instance');
var User = require('models/mongo/user');
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
  if (origInstance) {
    // we don't want to fetch origInstance owner
    // and we know for sure that owner for two instances is the same
    origInstance.owner = instance.owner;
  }
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
    // error is 404 we still want to process with checking access.
    // github returns 404 even if resource is there but access is denied
    if (err && err.output && err.output.statusCode !== 404) { return callback(err); }
    // case 1, 3
    if (isPublic) {
      return callback(null);
    }
    // case 4
    if (orgName) {
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
      self.github.isCollaborator(shortRepo, process.env.RUNNABOT_GITHUB_USERNAME,
        function (err, isCollaborator) {
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
  if (!instance || !instance.contextVersion) {
    return cb(null);
  }
  var self = this;

  var repos = instance.contextVersion.appCodeVersions;
  if (!repos || repos.length === 0) {
    return cb(null);
  }
  async.each(repos, function (repo, callback) {
    self._updatePullRequestsCommentsForRepo(repo.lowerRepo, repo.lowerBranch, instance, callback);
  }, cb);
};


GitHub.prototype._updatePullRequestsCommentsForRepo = function (shortRepo, branch, instance, cb) {
  debug('_updatePullRequestsCommentsForRepo', formatArgs(arguments));
  var self = this;

  var tasks = {
    instances: Instance.findInstancesLinkedToBranch.bind(this, shortRepo, branch),
    prs: this.github.listOpenPullRequestsForBranch.bind(this.github, shortRepo, branch)
  };
  async.parallel(tasks, function (err, results) {
    if (err) { return cb(err); }
    var instances = results.instances;
    var prs = results.prs;
    if (!prs) {
      return cb(null);
    }

    var ids = prs.map(pluck('number'));
    async.map(ids, function (number, callback) {
      var gitInfo = {
        owner: {
          login: instance.owner.login || instance.owner.username
        },
        number: number,
        repoName: shortRepo.split('/')[1],
        shortRepo: shortRepo,
        branch: branch
      };
      if (!instances || instances.length === 0) {
        self._getHeadCommit(instance.createdBy.github, shortRepo, number,
          function (err, headCommit) {
            if (err) {return cb(err);}
            gitInfo.headCommit = headCommit.commit;
            gitInfo.commit = headCommit.sha;
            self._updateComment(gitInfo, instances, callback);
          });
        } else {
          self._updateComment(gitInfo, instances, callback);
        }
      }, cb);
  });
};

GitHub.prototype._getHeadCommit = function (githubId, repo, number, cb) {
  debug('_getHeadCommit', formatArgs(arguments));
  User.findByGithubId(githubId, function (err, user) {
    if (err || !user) { return cb(err); }
    var gh = new GitHubAPI({token: user.accounts.github.accessToken});
    gh.getPullRequestHeadCommit(repo, number, cb);
  });
};

GitHub.prototype._updateComment = function (gitInfo, instances, callback) {
  debug('_updateComment', formatArgs(arguments));
  var self = this;
  this.github.findCommentByUser(gitInfo.shortRepo, gitInfo.number,
    process.env.RUNNABOT_GITHUB_USERNAME,
    function (err, comment) {
      if (err || !comment) {
        return callback(err);
      }
      var oldMessage = comment.body;
      var newMessage = self._renderMessage(gitInfo, instances);
      if (newMessage === oldMessage) {
        return callback(null);
      }
      self.github.updateComment(gitInfo.shortRepo, comment.id, newMessage, callback);
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