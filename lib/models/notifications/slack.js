'use strict';
var slack = require('slack-notify');

function Slack (contextVersions) {
  this.contextVersions = contextVersions;
}

Slack.prototype.notifyOnBuild = function (cb) {
  var contextVersion = this.contextVersions[0];
  console.log('fill context version for slack', contextVersion);
  var commitLog = contextVersion.build.triggeredAction.appCodeVersion.commitLog;
  var latestCommitAuthor = commitLog[0].author;
  var appCode = contextVersion.appCodeVersions[0];
  var text = latestCommitAuthor.username;
  text += ' latest push to *' + appCode.repo + '@' + appCode.branch + '*';
  text += ' is now runnable. ';
  text += 'There are ' + commitLog.length + ' commits in this push. ';
  text += 'The change is deployed on ...';
  // TODO: take webhook from the settings
  var webhookUrl = 'https://hooks.slack.com/services/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';
  var slackClient = slack(webhookUrl);
  // TODO: take channel from the settings
  // TODO: clarify username and icon to be used
  var opts = {
    channel: '#notifications',
    username: 'runnabot',
    text: text,
    icon_url: 'https://avatars0.githubusercontent.com/u/2828361?v=3&s=200'
  };
  slackClient.send(opts, cb);
};

module.exports = Slack;