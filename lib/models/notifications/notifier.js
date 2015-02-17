'use strict';
var fs    = require('fs');
var debug = require('debug')('runnable-notifications:notifier');
var Handlebars = require('handlebars');
var last = require('101/last');
var prune = require('underscore.string/prune');
var lines = require('underscore.string/lines');

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
  // we do double encoding here for angular because
  // browser would automatically replace `%2F` to `/` and angular router will fail
  return encodeURIComponent(encodeURIComponent(str));
});

Handlebars.registerHelper('commitMessage', commitMessageCleanup);
Handlebars.registerHelper('wrapGitHubLink', wrapGitHubLink);
Handlebars.registerHelper('slackCommitMessage', function (msg) {
  return slackEscape(commitMessageCleanup(msg));
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
Notifier.prototype.send = function (/* message, cb */) {
  throw new Error('Not implemented');
};

Notifier.prototype.makeOnBuildMessage = function(githubPushInfo) {
  githubPushInfo.domain = process.env.DOMAIN;
  return this.onBuildTpl(githubPushInfo);
};

// should be implemented in the subclass
Notifier.prototype.makeOnInstancesMessage = function(/* githubPushInfo, instances */) {
  throw new Error('Not implemented');
};

// Notify when image was build and ready to be run
Notifier.prototype.notifyOnBuild = function (githubPushInfo, cb) {
  debug('notifyOnBuild', githubPushInfo);
  var message = this.makeOnBuildMessage(githubPushInfo);
  this.send(message, cb);
};

// Notify when image was build and deployed to instance
Notifier.prototype.notifyOnInstances = function (githubPushInfo, instances, cb) {
  debug('notifyOnInstances', githubPushInfo);
  if (instances && instances.length > 0) {
    debug('notify on instances', instances);
    var message = this.makeOnInstancesMessage(githubPushInfo, instances);
    this.send(message, cb);
  }
  else {
    // do nothing
    cb(null);
  }
};

module.exports = Notifier;

function wrapGitHubLink (url) {
  return process.env.FULL_API_DOMAIN + '/actions/redirect?url=' + encodeURIComponent(url);
}

function commitMessageCleanup (message) {
  var withoutNewLines = lines(message).join(' ');
  return prune(withoutNewLines, 50).trim();
}

/**
 * Slack requires light escaping with just 3 rules:
 * & replaced with &amp;
 * < replaced with &lt;
 * > replaced with &gt;
 */
var ampRegExp = new RegExp('&', 'g');
var ltRegExp = new RegExp('<', 'g');
var gtRegExp = new RegExp('>', 'g');
function slackEscape (str) {
  return str.replace(ampRegExp, '&amp;').replace(ltRegExp, '&lt;').replace(gtRegExp, '&gt;');
}

function githubMoreLink(repo, commitLog) {
  var fistCommitId = commitLog[0].id.slice(0, 12);
  var lastCommitId = last(commitLog).id.slice(0, 12);
  var targetUrl = 'https://github.com/' + repo +
          '/compare/' + fistCommitId + '...' + lastCommitId;
  return wrapGitHubLink(targetUrl);
}