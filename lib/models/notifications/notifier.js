'use strict';
var fs    = require('fs');
var debug = require('debug')('runnable-notifications:notifier');
var Hogan = require('hogan.js');
//
function Notifier (name, settings) {
  this.name = name;
  this.settings = settings;
  this.onBuldTpl = createTpl(__dirname + '/tpls/' + this.name + '_on_build.txt');
  this.onInstanceTpl = createTpl(__dirname +  '/tpls/' + this.name + '_on_instance.txt');
}

function createTpl (tplPath) {
  // TODO (anton) add error handling if file is missing
  var content = fs.readFileSync(tplPath, {encoding: 'utf8'});
  return Hogan.compile(content);
}


// should be implemented in the subclass
Notifier.prototype.send = function (text, cb) {
  throw new Error('Not implemented');
}

// Notify when image was build and ready to be run
Notifier.prototype.notifyOnBuild = function (contextVersions, cb) {
  var contextVersion = contextVersions[0];
  debug('fill context version for', contextVersion);
  var commitLog = contextVersion.build.triggeredAction.appCodeVersion.commitLog;
  var latestCommitAuthor = commitLog[0].author;
  var appCode = contextVersion.appCodeVersions[0];
  var text = this.onBuldTpl.render({
    commitLog: commitLog,
    appCode: appCode,
    username: latestCommitAuthor.username
  })
  this.send(text, cb);
};

// Notify when image was build and deployed to instance
Notifier.prototype.notifyOnInstance = function (contextVersions, cb) {
  var contextVersion = contextVersions[0];
  debug('fill context version for', contextVersion);
  var commitLog = contextVersion.build.triggeredAction.appCodeVersion.commitLog;
  var latestCommitAuthor = commitLog[0].author;
  var appCode = contextVersion.appCodeVersions[0];
  var text = this.onInstanceTpl.render({
    commitLog: commitLog,
    appCode: appCode,
    username: latestCommitAuthor.username
  })
  this.send(text, cb);
};

module.exports = Notifier;