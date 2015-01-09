'use strict';
var fs    = require('fs');
var debug = require('debug')('runnable-notifications:notifier');
var Handlebars = require('handlebars');

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
Notifier.prototype.notifyOnBuild = function (githubPushInfo, cb) {
  debug('fill context version for', githubPushInfo);
  var text = this.onBuildTpl(githubPushInfo);
  this.send(text, cb);
};

// Notify when image was build and deployed to instance
Notifier.prototype.notifyOnInstances = function (githubPushInfo, instances, cb) {
  debug('fill context version for');
  githubPushInfo.instances = instances;
  var text = this.onInstancesTpl(githubPushInfo);
  this.send(text, cb);
};

module.exports = Notifier;