'use strict';

var util = require('util');
var async = require('async');
var GithubApi = require('github');
var find = require('101/find');
var hasKeypaths = require('101/has-keypaths');
var envIs = require('101/env-is');
var Boom = require('dat-middleware').Boom;
var defaults = require('defaults');
var Boom = require('dat-middleware').Boom;
var debug = require('debug')('runnable-api:github:model');

module.exports = Github;

function Github (opts) {
  opts = defaults(opts, {
    // required
    version: '3.0.0',
    // optional
    debug: envIs('development', 'test'),
    protocol: 'https',
    requestMedia: 'application/json'
  });
  GithubApi.call(this, opts);

  if (opts.token) {
    this.authenticate({
      type: 'oauth',
      token: opts.token
    });
  }
  else {
    this.authenticate({
      type: 'oauth',
      key:  process.env.GIT_HUB_CLIENT_ID,
      secret: process.env.GIT_HUB_CLIENT_SECRET
    });
  }
}

util.inherits(Github, GithubApi);

Github.prototype.getUserOrgs = function (cb) {
  this.user.getOrgs({ per_page: 100 }, function (err, orgs) {
    if (err) {
      cb(Boom.create(502, 'Failed to get github orgs', { err: err }));
    }
    else {
      cb(null, orgs);
    }
  });
};

Github.prototype.userIsMemberOf = function (githubOrgId, cb) {
  this.getUserOrgs(function (err, orgs) {
    if (err) { return cb(err); }
    var isMember = orgs.some(hasKeypaths({
      'id.toString()': githubOrgId.toString()
    }));
    cb(null, isMember);
  });
};

Github.prototype.getUserByUsername = function (username, cb) {
  // FIXME: cache!
  debug('getting username ' + username);
  this.user.getFrom({ user: username }, function (err, user) {
    if (err) {
      err = (err.code === 404) ?
        Boom.notFound('Github user with username ' + username + ' not found.', { err: err }) :
        Boom.create(502, 'Failed to get github user by username ' + username , { err: err });
      cb(err);
    }
    else {
      cb(null, user);
    }
  });
};

Github.prototype._listRepoHooks = function (shortRepo, cb) {
  debug('_listRepoHooks');
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
  debug('_createRepoHook');
  var split = shortRepo.split('/');
  var query = {
    user: split[0],
    repo: split[1],
    name: process.env.GIT_HUB_HOOK_NAME,
    config: {
      url: process.env.GIT_HUB_HOOK_URL
    },
    events: ['push']
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

Github.prototype.createRepoHookIfNotAlready = function (shortRepo, cb) {
  var self = this;
  debug('createRepoHookIfNotAlready');
  async.waterfall([
    this._listRepoHooks.bind(this, shortRepo),
    function subscribeToHooksIfNotAlready (existingHooks, cb) {
      var hookExists = !!find(existingHooks, hasKeypaths({
        'config.url': process.env.GIT_HUB_HOOK_URL,
        active: true
      }));

      if (hookExists) {
        cb();
      }
      else {
        self._createRepoHook(shortRepo, cb);
      }
    }
  ], cb);
};

Github.prototype.deleteRepoHook = function (shortRepo, cb) {
  var self = this;
  var split = shortRepo.split('/');

  async.waterfall([
    this._listRepoHooks.bind(this, shortRepo),
    deleteHookIfExists
  ], cb);

  function deleteHookIfExists (existingHooks, cb) {
    var hook = find(existingHooks, hasKeypaths({
      'config.url': process.env.GIT_HUB_HOOK_URL,
      active: true
    }));
    if (!hook) {
      return cb(); // ignore not found
    }
    var query = {
      user: split[0],
      repo: split[1],
      id: hook.id
    };
    self.repos.deleteHook(query, function (err) {
      if (err) {
        err = (err.code === 404) ?
          Boom.notFound('Github repo ' + shortRepo + ' not found.', { err: err }) :
          Boom.create(502, 'Failed to delete github repo hook for ' + shortRepo , { err: err });
        cb(err);
      }
      else {
        cb();
      }
    });
  }
};