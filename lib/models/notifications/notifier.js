'use strict';
var fs    = require('fs');
var debug = require('debug')('runnable-notifications:notifier');
var Handlebars = require('handlebars');
var find = require('101/find');
var hasProps = require('101/has-properties');
var last = require('101/last');

Handlebars.registerHelper('commitsFormat', function(commitLog) {
  if (commitLog.length === 1) {
    return 'is 1 commit';
  }
  return 'are ' + commitLog.length + ' commits';
});

var onBuildTpls = {};
var onInstanceTpls = {};

function Notifier (name, settings) {
  if (!name) {
    throw new Error('Please provide name for the notifier');
  }
  this.name = name;
  this.settings = settings || {};
  // use cached versions of tpls if available.
  if (!onBuildTpls[name]) {
    onBuildTpls[name] = createTpl('./templates/' + this.name + '_on_build.hbs');
  }
  this.onBuildTpl = onBuildTpls[name];
  if (!onInstanceTpls[name]) {
    onInstanceTpls[name] = createTpl('./templates/' + this.name + '_on_instances.hbs');
  }
  this.onInstancesTpl = onInstanceTpls[name];
}

function createTpl (tplPath) {
  var content = fs.readFileSync(tplPath, {encoding: 'utf8'});
  return Handlebars.compile(content);
}


// should be implemented in the subclass
Notifier.prototype.send = function (/* text, cb */) {
  throw new Error('Not implemented');
};

// Notify when image was build and ready to be run
Notifier.prototype.notifyOnBuild = function (commitLog, contextVersions, cb) {
  var contextVersion = contextVersions[0];
  debug('fill context version for', contextVersion);
  var lastestCommit = last(commitLog);
  var latestCommitAuthor = lastestCommit.author;
  var latestCommitId = lastestCommit.id;
  var appCode = find(contextVersion.appCodeVersions, hasProps({ commit : latestCommitId }));
  var text = this.onBuildTpl({
    commitLog: commitLog,
    appCode: appCode,
    username: latestCommitAuthor.username
  });
  this.send(text, cb);
};

// Notify when image was build and deployed to instance
Notifier.prototype.notifyOnInstances = function (commitLog, contextVersions, instances, cb) {
  var contextVersion = contextVersions[0];
  debug('fill context version for', contextVersion);
  var lastestCommit = last(commitLog);
  var latestCommitAuthor = lastestCommit.author;
  var latestCommitId = lastestCommit.id;
  var appCode = find(contextVersion.appCodeVersions, hasProps({ commit : latestCommitId }));
  var text = this.onInstancesTpl({
    commitLog: commitLog,
    appCode: appCode,
    username: latestCommitAuthor.username,
    instances: instances
  });
  this.send(text, cb);
};

module.exports = Notifier;