'use strict';
var fs    = require('fs');
var async = require('async');
var GitHubAPI = require('models/apis/github');
var Instance = require('models/mongo/instance');
var User = require('models/mongo/user');
var debug = require('debug')('runnable-integrations:github');
var noop = require('101/noop');
var pluck = require('101/pluck');
var formatArgs = require('format-args');
var Boom = require('dat-middleware').Boom;


function GitHub (token) {
  this.github = new GitHubAPI({token: token});
}

GitHub.prototype.createDeployment = function (gitInfo, payload, cb) {
  this.github.createDeployment(gitInfo.repo, gitInfo.commit, payload, cb);
};

GitHub.prototype.createDeploymentStatus = function (gitInfo, deploymentId, state, cb) {
  this.github.createDeploymentStatus(gitInfo.repo, deploymentId, {state: state}, cb);
};



module.exports = GitHub;