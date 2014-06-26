'use strict';

var util = require('util');
var GithubApi = require('github');
// var envIs = require('101/env-is');
var defaults = require('defaults');
var configs = require('configs');

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
      key:  configs.GitHub.clientId,
      secret: configs.GitHub.clientSecret
    });
  }
}

util.inherits(Github, GithubApi);