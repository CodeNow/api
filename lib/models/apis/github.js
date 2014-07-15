'use strict';

var util = require('util');
var GithubApi = require('github');
var defaults = require('defaults');
var Boom = require('dat-middleware').Boom;
var debug = require('debug')('runnable-api:github:model');

module.exports = Github;

function Github (opts) {
  opts = defaults(opts, {
    // required
    version: '3.0.0',
    // optional
    debug: false, // envIs('development', 'test'),
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
