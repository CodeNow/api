'use strict';

var util = require('util');
var GithubApi = require('github');
// var envIs = require('101/env-is');
var defaults = require('defaults');

module.exports = Github;

function Github (opts) {
  opts = defaults(opts, {
    // required
    version: "3.0.0",
    // optional
    debug: false, // envIs('development', 'test'),
    protocol: "https",
    requestMedia: 'application/json'
  });
  GithubApi.call(this, opts);

  if (opts.token) {
    this.authenticate({
      type: "oauth",
      token: opts.token
    });
  }
  else {
    this.authenticate({
      type: "oauth",
      key:  process.env.GIT_HUB_CLIENT_ID,
      secret: process.env.GIT_HUB_CLIENT_SECRET
    });
  }
}

util.inherits(Github, GithubApi);