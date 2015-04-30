/**
 * GitHub API request wrapper methods
 * @module lib/models/apis/github
 */
'use strict';

var Boom = require('dat-middleware').Boom;
var GithubApi = require('github');
var async = require('async');
var aws = require('aws-sdk');
var crypto = require('crypto');
var debug = require('debug')('runnable-api:github:model');
var defaults = require('defaults');
var find = require('101/find');
var hasKeypaths = require('101/has-keypaths');
var hasProps = require('101/has-properties');
var keypather = require('keypather')();
var redisTypes = require('redis-types');
var util = require('util');

var Keypair = require('models/mongo/keypair');
var formatArgs = require('format-args');

module.exports = Github;

var cacheQueue = {};
var keyPrefix = process.env.REDIS_NAMESPACE + 'github-model-cache:';
var s3 = new aws.S3();

function parseCacheControl (str) {
  if (!str) { return {}; }
  var params = str.split(',').map(function (v) { return v.trim(); });
  var ret = {};
  params.forEach(function (v) {
    if (/.+=.+/.test(v)) {
      var s = v.split('=');
      ret[s[0]] = s[1];
    } else {
      ret[v] = true;
    }
  });
  return ret;
}

function Github (opts) {
  opts = defaults(opts, {
    // required
    version: '3.0.0',
    // optional
    debug: false, //envIs('development', 'test'),
    protocol: 'https',
    requestMedia: 'application/json'
  });
  GithubApi.call(this, opts);
  if (opts.token) {
    this.token = opts.token;
    var md5sum = crypto.createHash('md5');
    md5sum.update(opts.token);
    this.tokenHash = md5sum.digest('hex');
    this.authenticate({
      type: 'oauth',
      token: opts.token
    });
  }
  else {
    this.authenticate({
      type: 'oauth',
      key:  process.env.GITHUB_CLIENT_ID,
      secret: process.env.GITHUB_CLIENT_SECRET
    });
  }
}

util.inherits(Github, GithubApi);

Github.prototype.getRepo = function (repo, cb) {
  debug('getRepo', formatArgs(arguments));
  debug('getting repo ' + repo);
  var split = repo.split('/');
  var userKey = keyPrefix + (this.token ? this.tokenHash : 'runnable');
  var usernameKey = new redisTypes.String(userKey + ':getRepo:' + repo);
  this._runQueryAgainstCache({
    query: this.repos.get,
    debug: 'this.repos.get',
    opts: {
      user: split[0],
      repo: split[1]
    },
    stringKey: usernameKey
  }, cb);
};

Github.prototype.isPublicRepo = function (repo, cb) {
  debug('isPublicRepo', formatArgs(arguments));
  this.getRepo(repo, function (err, data) {
    if (err) { return cb(err); }
    if (!data) {
      return cb(Boom.notFound('Github repo ' + repo + ' not found.'));
    }
    cb(null, !data['private']);
  });
};

Github.prototype.getRepoContent = function (repo, fullPath, cb) {
  debug('getRepoFile', formatArgs(arguments));
  debug('getting repo "'+repo+'" file :'+fullPath);
  var split = repo.split('/');
  var userKey = keyPrefix + (this.token ? this.tokenHash : 'runnable');
  var usernameKey = new redisTypes.String(userKey + ':getRepo:' + repo + ':content:' + fullPath);
  this._runQueryAgainstCache({
    query: this.repos.getContent,
    debug: 'this.repos.getContent',
    opts: {
      user: split[0],
      repo: split[1],
      path: fullPath
    },
    stringKey: usernameKey
  }, cb);
};

Github.prototype.getDeployKeys = function (repo, cb) {
  debug('getDeployKeys', formatArgs(arguments));
  debug('getting repo keys for ' + repo);
  var split = repo.split('/');
  this.repos.getKeys({
    user: split[0],
    repo: split[1],
    per_page: 100
  }, cb);
};

Github.prototype.getUserForCommit = function (repo, commit, cb) {
  debug('getUserForCommit', formatArgs(arguments));
  this.getCommit(repo, commit, function (err, commit) {
    if (err) { cb(err); }
    else { cb(null, commit.committer); }
  });
};

Github.prototype.getCommit = function (repo, commit, cb) {
  debug('getCommit', formatArgs(arguments));
  var splitRepo = repo.split('/');
  var ownername = splitRepo[0];
  var reponame = splitRepo[1];
  var self = this;
  debug('getting repo:commit ' + repo + ':' + commit);
  var userKey = keyPrefix + (this.token ? this.tokenHash : 'runnable');
  var usernameKey = new redisTypes.String(userKey + ':repo:' + repo + ':commit:' + commit);
  self._runQueryAgainstCache({
    query: this.repos.getCommit,
    debug: 'this.repos.getCommit',
    opts: { user: ownername, repo: reponame, sha: commit },
    stringKey: usernameKey
  }, cb);
};

Github.prototype.getLatestCommit = function (repo, branch, cb) {
  debug('getLatestCommit', formatArgs(arguments));
  this.getBranch(repo, branch, function (err, branch) {
    if (err) { cb(err); }
    else { cb(null, branch.commit); }
  });
};



Github.prototype.getBranch = function (repo, branch, cb) {
  debug('getBranch', formatArgs(arguments));
  var splitRepo = repo.split('/');
  var ownername = splitRepo[0];
  var reponame = splitRepo[1];
  var self = this;
  debug('getting repo:branch ' + repo + ':' + branch);
  var userKey = keyPrefix + (this.token ? this.tokenHash : 'runnable');
  var usernameKey = new redisTypes.String(userKey + ':repo:' + repo + ':branch:' + branch);
  self._runQueryAgainstCache({
    query: this.repos.getBranch,
    debug: 'this.repos.getBranch',
    opts: { user: ownername, repo: reponame, branch: branch },
    stringKey: usernameKey
  }, cb);
};

Github.prototype.getAuthorizedUser = function (cb) {
  debug('getAuthorizedUser', formatArgs(arguments));
  if (!this.token) {
    return cb(Boom.badImplementation('getAuthorizedUser should only be called with a user token'));
  }
  var self = this;
  debug('getting user self');
  var userKey = keyPrefix + (this.token ? this.tokenHash : 'runnable');
  var usernameKey = new redisTypes.String(userKey + ':get:self');
  self._runQueryAgainstCache({
    query: this.user.get,
    debug: 'this.user.get',
    stringKey: usernameKey
  }, cb);
};

Github.prototype.getUserByUsername = function (username, cb) {
  debug('getUserByUsername', formatArgs(arguments));
  // WARNING: this is getting the information we can get through our api token.
  // this does not return ALL user data, use Github.getUser for that.
  var self = this;
  debug('getting username ' + username);
  var userKey = keyPrefix + (this.token ? this.tokenHash : 'runnable');
  var usernameKey = new redisTypes.String(userKey + ':getByUsername:' + username);
  self._runQueryAgainstCache({
     query: this.user.getFrom,
     debug: 'this.user.getFrom',
     opts: { user: username },
     stringKey: usernameKey
   }, cb);
};

Github.prototype.getUserAuthorizedOrgs = function (cb) {
  debug('getUserAuthorizedOrgs', formatArgs(arguments));
  if (!this.token) {
    var errorMsg = 'getUserAuthorizedOrgs should only be called with a user token';
    return cb(Boom.badImplementation(errorMsg));
  }
  var self = this;
  debug('getting user orgs');
  var userKey = keyPrefix + (this.token ? this.tokenHash : 'runnable');
  var userOrgsKey = new redisTypes.String(userKey + ':user:' + this.token + ':orgs');
  self._runQueryAgainstCache({
    query: this.user.getOrgs,
    debug: 'this.user.getOrgs',
    stringKey: userOrgsKey
  }, cb);
};

// I assume one would only ever not pass `opts`.
Github.prototype._runQueryAgainstCache = function (options, cb) {
  debug('_runQueryAgainstCache');
  var self = this;
  var query = options.query;
  var stringKey = options.stringKey || undefined;
  var opts = options.opts || {};

  async.waterfall([
    fetchCachedQueryDataAndMakeDecision,
    checkDataAndRunAnyRequest
  ], function (err, data) {
    if (err) { return cb(err); }
    cb(err, data.data, data.meta);
  });

  function fetchCachedQueryDataAndMakeDecision (cb) {
    debug('fetchCachedQueryDataAndMakeDecision');
    stringKey.get(function (err, cachedData) {
      if (err) { return cb(err); }
      debug('did we get data from redis?', !!cachedData);
      if (!cachedData) {
        // if we don't have cached data make the request to get it
        debug('going to make the query');
        cb(null, null /* triggers fetch */, false);
      } else {
        // our data is valid!
        if (!cacheQueue[stringKey.key]) {
          // if nobody has been passed through to update the cache EX yet
          debug('setting cacheQueue', stringKey.key);
          cacheQueue[stringKey.key] = true;
          cb(null, cachedData, true /* triggers cache EX update */);
        } else {
          // someone else is refreshing the cache EX... just use the data
          debug('just using the cached data');
          cb(null, cachedData, false);
        }
      }
    });
  }

  function checkDataAndRunAnyRequest (cachedData, updateCacheEx, cb) {
    debug('checkDataAndRunAnyRequest');
    debug('did we get redis data?', !!cachedData);
    debug('are we supposed to update the cache EX?', !!updateCacheEx);

    var githubResponse;
    if (cachedData) {
      // if we got redis data... just use it and keep going
      cachedData = JSON.parse(cachedData);
      cb(null, cachedData);
      // if we are to update the cache EX, do that! so set the callback we will use
      if (updateCacheEx) {
        runQuery(true, function () {
          debug('deleting cacheQueue', stringKey.key);
          delete cacheQueue[stringKey.key];
        });
      }
    } else {
      // we don't have data, so we need to make the request
      runQuery(false, cb);
    }

    /* jshint maxcomplexity:6 */
    function runQuery (sendConditionalHeader, cb) {
      debug('runQuery; query:', options.debug);
      // this is a shim so we can get a hold of the full github response
      //self._httpSend = self.httpSend;
      if (sendConditionalHeader) {
        cacheQueue[stringKey.key] = self.httpSend;
      } else {
        self._httpSend = self.httpSend;
      }
      self.httpSend = function () {
        var args = Array.prototype.slice.call(arguments);
        if (typeof args[2] === 'function') {
          var httpSendCb = args.pop();
          args.push(function (err, res) {
            githubResponse = res;
            httpSendCb(err, res);
          });
        }
        if (sendConditionalHeader) {
          cacheQueue[stringKey.key].apply(self, args);
        } else {
          self._httpSend.apply(self, args);
        }
      };
      if (sendConditionalHeader) {
        if (!opts.headers) { opts.headers = {}; }
        opts.headers['if-none-match'] = keypather.get(cachedData, 'meta.etag');
      }
      query(opts, function (err, data) {
        if (sendConditionalHeader) {
          self.httpSend = cacheQueue[stringKey.key];
        } else {
          self.httpSend = self._httpSend;
        }
        if (err) {
          if (err.code && err.message) {
            return cb(Boom.create(err.code, err.message));
          } else {
            return cb(err);
          }
        }

        if (sendConditionalHeader && /^304.*/.test(data.meta.status)) {
          cache304Response(stringKey, function () {
            cb(err, cachedData);
          });
        } else {
          // re-format data
          var saveData = {};
          if (data.meta) { saveData.meta = data.meta; delete data.meta; }
          saveData.data = data;
          cacheFullResponse(stringKey, saveData, function () {
            cb(err, saveData);
          });
        }
      });
    }
    /* jshint maxcomplexity:5 */

    function cache304Response(key, cb) {
      var cc = parseCacheControl(keypather.get(githubResponse, 'headers.cache-control'));
      debug('extending the cache\'s expiration');
      key.expire(cc['max-age'] || 60, cb);
    }

    function cacheFullResponse (key, data, cb) {
      var d = JSON.stringify(data);
      var cc = parseCacheControl(keypather.get(githubResponse, 'headers.cache-control'));
      debug('caching the response', key, d);
      key.setex(cc['max-age'] || 60, d, cb);
    }
  }
};

Github.prototype._listRepoHooks = function (shortRepo, cb) {
  debug('_listRepoHooks', formatArgs(arguments));
  var split = shortRepo.split('/');
  var query = {
    user: split[0],
    repo: split[1],
    per_page: 100
  };
  this.repos.getHooks(query, function (err, hooks) {
    debug('back from listing hook');
    if (err) {
      err = (err.code === 404) ?
        Boom.notFound('Github repo ' + shortRepo + ' not found.', { err: err }) :
        Boom.create(502, 'Failed to get github repo hooks for ' + shortRepo , { err: err });
      cb(err);
    }
    else {
      cb(null, hooks);
    }
  });
};

Github.prototype._createRepoHook = function (shortRepo, cb) {
  debug('_createRepoHook', formatArgs(arguments));
  var split = shortRepo.split('/');
  var query = {
    user: split[0],
    repo: split[1],
    name: process.env.GITHUB_HOOK_NAME,
    config: {
      url: process.env.GITHUB_HOOK_URL,
      content_type: 'json'
    },
    events: ['*']
  };

  this.repos.createHook(query, function (err, hook) {
    debug('back from creating hook', err);
    if (err) {
      err = (err.code === 404) ?
        Boom.notFound('Github repo ' + shortRepo + ' not found.', { err: err }) :
        Boom.create(502, 'Failed to create github repo hook for ' + shortRepo , { err: err });
      cb(err);
    }
    else {
      cb(null, hook);
    }
  });
};

Github.prototype._updateRepoHook = function (hookId, shortRepo, cb) {
  debug('_updateRepoHook', formatArgs(arguments));
  var split = shortRepo.split('/');
  var query = {
    user: split[0],
    repo: split[1],
    name: process.env.GITHUB_HOOK_NAME,
    config: {
      url: process.env.GITHUB_HOOK_URL,
      content_type: 'json'
    },
    events: ['*'],
    id: hookId
  };

  this.repos.updateHook(query, function (err, hook) {
    debug('back from updating hook', err);
    if (err) {
      err = (err.code === 404) ?
        Boom.notFound('Github repo hook ' + hookId + ' not found.', { err: err }) :
        Boom.create(502, 'Failed to update github repo hook with id ' + hookId , { err: err });
      cb(err);
    }
    else {
      cb(null, hook);
    }
  });
};

Github.prototype.createRepoHookIfNotAlready = function (shortRepo, cb) {
  var self = this;
  debug('createRepoHookIfNotAlready', formatArgs(arguments));
  async.waterfall([
    this._listRepoHooks.bind(this, shortRepo),
    function subscribeToHooksIfNotAlready (existingHooks, cb) {
      var hookExists = find(existingHooks, hasKeypaths({
        'config.url': process.env.GITHUB_HOOK_URL,
        active: true
      }));

      debug('hook was found?', hookExists ? true : false);
      if (hookExists) {
        if (hookExists.events[0] === '*') {
          cb(null, hookExists);
        }
        // TODO (anton) let's remove this if migration will work on production without errors.
        else {
          self._updateRepoHook(hookExists.id, shortRepo, cb);
        }
      }
      else {
        self._createRepoHook(shortRepo, cb);
      }
    }
  ], function (err) {
    debug('hook checked (and created)');
    cb(err);
  });
};


Github.prototype.listOpenPullRequestsForBranch = function (shortRepo, branch, cb) {
  debug('listOpenPullRequestsForBranch', formatArgs(arguments));
  var split = shortRepo.split('/');
  var query = {
    user: split[0],
    repo: split[1],
    state: 'open',
    head: branch
  };
  this.pullRequests.getAll(query, function (err, prs) {
    if (err) {
      err = (err.code === 404) ?
        Boom.notFound('Cannot find open PRs for ' + shortRepo + '@'  + branch,
          { err: err, report: false  }) :
        Boom.create(502, 'Failed to get PRs for ' + shortRepo + '@'  + branch, { err: err });
      cb(err);
    }
    else {
      prs = prs || [];
      // for some reason head branch filtering is not applied.
      // TODO check if this is problem with GitHub API or nodejs lib
      prs = prs.filter(hasKeypaths({'head.ref': branch}));
      cb(null, prs);
    }
  });
};

Github.prototype.getPullRequest = function (shortRepo, number, cb) {
  debug('getPullRequest', formatArgs(arguments));
  var split = shortRepo.split('/');
  var query = {
    user: split[0],
    repo: split[1],
    number: number
  };
  this.pullRequests.get(query, function (err, pr) {
    if (err) {
      err = (err.code === 404) ?
        Boom.notFound('Cannot find PRs for ' + shortRepo,
          { err: err, report: false, pullRequest: number }) :
        Boom.create(502, 'Failed to get PR for ' + shortRepo,
          { err: err, pullRequest: number  });
      cb(err);
    }
    else {
      cb(null, pr);
    }
  });
};

Github.prototype.getPullRequestHeadCommit = function (shortRepo, number, cb) {
  debug('getPullRequestHeadCommit', formatArgs(arguments));
  var self = this;
  this.getPullRequest(shortRepo, number, function (err, pullRequest) {
    if (err) { return cb(err); }
    if (!pullRequest) {
      var msg = 'Cannot find pull request: ' + shortRepo + '#' + number;
      return cb(Boom.notFound(msg, {report: false}));
    }
    var commitId = pullRequest.head.sha;
    self.getCommit(shortRepo, commitId, cb);
  });
};


Github.prototype.createDeployment = function (shortRepo, query, cb) {
  debug('createDeployment', formatArgs(arguments));
  var split = shortRepo.split('/');
  query.user =  split[0];
  query.repo = split[1];
  this.deployments.create(query, function (err, deployment) {
    if (err) {
      err = (err.code === 404) ?
        Boom.notFound('Cannot find repo or ref: ' + shortRepo,
          { err: err, report: false, query: query }) :
        Boom.create(502, 'Failed to find repo or ref ' + shortRepo,
          { err: err, query: query });
      return cb(err);
    }
    cb(null, deployment);
  });
};

Github.prototype.createDeploymentStatus = function (shortRepo, query, cb) {
  debug('createDeploymentStatus', formatArgs(arguments));
  var split = shortRepo.split('/');
  query.user =  split[0];
  query.repo = split[1];
  this.deployments.createStatus(query, function (err, deployment) {
    if (err) {
      err = (err.code === 404) ?
        Boom.notFound('Cannot find repo, ref or deployment: ' + shortRepo,
          { err: err, report: false, query: query }) :
        Boom.create(502, 'Failed to find repo, ref or deployment ' + shortRepo,
          { err: err, query: query });
      return cb(err);
    }
    cb(null, deployment);
  });
};

Github.prototype.createBuildStatus = function (shortRepo, query, cb) {
  debug('createBuildStatus', formatArgs(arguments));
  var split = shortRepo.split('/');
  query.user =  split[0];
  query.repo = split[1];
  this.statuses.create(query, function (err, status) {
    if (err) {
      err = (err.code === 404) ?
        Boom.notFound('Cannot find repo or sha: ' + shortRepo,
          { err: err, report: false, query: query }) :
        Boom.create(502, 'Failed to find repo or sha ' + shortRepo,
          { err: err, query: query });
      return cb(err);
    }
    cb(null, status);
  });
};

Github.prototype.isOrgMember = function (orgName, cb) {
  debug('isOrgMember', formatArgs(arguments));
  this.user.getOrgMembership({ org: orgName }, function (err, membership) {
    if (err) {
      if (err.code === 404) {
        return cb(null, false);
      }
      return cb(Boom.create(502, 'failed to get org membership', { err: err }));
    }
    if (membership && membership.state !== 'pending') {
      return cb(null, true);
    }
    cb(Boom.notFound('cannot determine if user is a member of the org'));
  });
};


Github.prototype.checkForDeployKey = function (repo, cb) {
  debug('checking for deploy key');
  this.getDeployKeys(repo, function (err, keys) {
    debug('back from pulling deploy keys');
    if (err) { return cb(err); }
    var key = find(keys, hasProps({ title: process.env.GITHUB_DEPLOY_KEY_TITLE }));
    cb(err, key);
  });
};

Github.prototype.addDeployKey = function (repo, cb) {
  var self = this;
  var split = repo.split('/');
  async.waterfall([
    function getKeypair (cb) {
      Keypair.findOneAndRemove({}, function (err, doc) {
        if (err) { cb(err); }
        else if (!doc) { cb(Boom.create(503, 'unable to generate keypair')); }
        else { cb(err, doc); }
      });
    },
    function (keypair, cb) {
      debug('creating deploy key');
      self.repos.createKey({
        user: split[0],
        repo: split[1],
        title: process.env.GITHUB_DEPLOY_KEY_TITLE,
        key: keypair.publicKey
      }, function (err) {
        debug('done creating deploy key');
        cb(err, keypair);
      });
    },
    function (keypair, cb) {
      async.parallel({
        publicKey: s3.putObject.bind(s3, {
          Bucket: process.env.GITHUB_DEPLOY_KEYS_BUCKET,
          Key: repo + '.key.pub',
          Body: keypair.publicKey,
          ServerSideEncryption: 'AES256'
        }),
        privateKey: s3.putObject.bind(s3, {
          Bucket: process.env.GITHUB_DEPLOY_KEYS_BUCKET,
          Key: repo + '.key',
          Body: keypair.privateKey,
          ServerSideEncryption: 'AES256'
        }),
      }, cb);
    }
  ], cb);
};

Github.prototype.addDeployKeyIfNotAlready = function (repo, cb) {
  debug('checking for and adding deploy key');
  var self = this;
  async.waterfall([
    self.checkForDeployKey.bind(self, repo),
    function (key, cb) {
      if (!key) { self.addDeployKey(repo, cb); }
      else { cb(null); }
    },
  ], function (err) {
    if (err) { return cb(err); }
    cb(null, {
      publicKey: repo + '.key.pub',
      privateKey: repo + '.key'
    });
  });
};
