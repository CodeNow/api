'use strict';
var fs    = require('fs');
var debug = require('debug')('runnable-notifications:notifier');
var Handlebars = require('handlebars');
var last = require('101/last');

Handlebars.registerHelper('moreChangesHipchat', function(repo, commitLog) {
  if (commitLog.length === 1) {
    return '';
  }
  var text = ' and  <a href="' + githubMoreLink(repo, commitLog);
  text += '">' + (commitLog.length - 1) + ' more</a>';
  return text;
});

Handlebars.registerHelper('moreChangesSlack', function(repo, commitLog) {
  if (commitLog.length === 1) {
    return '';
  }
  var text = ' and  <' + githubMoreLink(repo, commitLog);
  text += '|' + (commitLog.length - 1) + ' more>';
  return text;
});


Handlebars.registerHelper('encode', function (str) {
    return encodeURIComponent(str);
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
  githubPushInfo.domain = process.env.DOMAIN;
  var text = this.onBuildTpl(githubPushInfo);
  this.send(text, cb);
};

// Notify when image was build and deployed to instance
Notifier.prototype.notifyOnInstances = function (githubPushInfo, instances, cb) {
  debug('fill context version for', githubPushInfo);
  if (instances && instances.length > 0) {
    debug('notify on instances', instances);
    githubPushInfo.instances = instances;
    githubPushInfo.domain = process.env.DOMAIN;
    var text = this.onInstancesTpl(githubPushInfo);
    this.send(text, cb);
  }
  else {
    // do nothing
    cb(null);
  }

};

module.exports = Notifier;


function githubMoreLink(repo, commitLog) {
  var fistCommitId = commitLog[0].id.slice(0, 12);
  var lastCommitId = last(commitLog).id.slice(0, 12);
  return 'https://github.com/' + repo +
          '/compare/' + fistCommitId + '...' + lastCommitId;
}