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
  // we do double encoding here for angular because
  // browser would automatically replace `%2F` to `/` and angular router will fail
  return encodeURIComponent(encodeURIComponent(str));
});

Handlebars.registerHelper('wrapGitHubLink', function (url) {
  return wrapGitHubLink(url);
});




/**
 * Slack requires light escaping with just 3 rules:
 * & replaced with &amp;
 * < replaced with &lt;
 * > replaced with &gt;
 */
var ampRegExp = new RegExp('&', 'g');
var ltRegExp = new RegExp('<', 'g');
var gtRegExp = new RegExp('>', 'g');
Handlebars.registerHelper('slackEscape', function (str) {
  return str.replace(ampRegExp, '&amp;').replace(ltRegExp, '&lt;').replace(gtRegExp, '&gt;');
});

var onNewBranchTpls = {};
var onInstanceTpls = {};

function Notifier (name, settings) {
  if (!name) {
    throw new Error('Please provide name for the notifier');
  }
  this.name = name;
  this.settings = settings || {};
  // use cached versions of tpls if available.

  if (!onNewBranchTpls[name]) {
    onNewBranchTpls[name] = createTpl('./templates/' + this.name + '_on_new_branch.hbs');
  }
  this.onNewBranchTpl = onNewBranchTpls[name];

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

Notifier.prototype.sendDirectMessage = function (/* gitUser, message, cb */) {
  throw new Error('Not implemented');
};


Notifier.prototype.makeOnNewBranchMessage = function(githubPushInfo) {
  githubPushInfo.domain = process.env.DOMAIN;
  return this.onNewBranchTpl(githubPushInfo);
};

// should be implemented in the subclass
Notifier.prototype.makeOnInstancesMessage = function(/* githubPushInfo, instances */) {
  throw new Error('Not implemented');
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

Notifier.prototype.notifyOnNewBranch = function (githubPushInfo, cb) {
  debug('notifyOnNewBranch', githubPushInfo);
  var message = this.makeOnNewBranchMessage(githubPushInfo);
  this.sendDirectMessage(githubPushInfo.headCommit.committer, message, cb);
};

module.exports = Notifier;

function wrapGitHubLink (url) {
  return process.env.FULL_API_DOMAIN + '/actions/redirect?url=' + encodeURIComponent(url);
}


function githubMoreLink(repo, commitLog) {
  var fistCommitId = commitLog[0].id.slice(0, 12);
  var lastCommitId = last(commitLog).id.slice(0, 12);
  var targetUrl = 'https://github.com/' + repo +
          '/compare/' + fistCommitId + '...' + lastCommitId;
  return wrapGitHubLink(targetUrl);
}