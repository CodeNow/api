'use strict';

var express = require('express');
var mw = require('dat-middleware');
var app = module.exports = express();
var me = require('middlewares/me');
var mongoMiddlewares = require('middlewares/mongo');
var users = mongoMiddlewares.users;
var settings = mongoMiddlewares.settings;
var slack = require('middlewares/apis').slack;
var utils = require('middlewares/utils');
var transformations = require('middlewares/transformations');
var replaceMeWithUserId = transformations.replaceMeWithUserId;
var flow = require('middleware-flow');
var or = flow.or;
var series = flow.series;
var checkFound = require('middlewares/check-found');
var validations = require('middlewares/validations');

app.get('/users/',
  mw.query('githubUsername').pick().require(),
  users.publicFindByGithubUsername('githubUsername'),
  mw.res.json('users'));

app.get('/users/:userId',
  mw.params('userId').mapValues(replaceMeWithUserId),
  flow.mwIf(or(me.isUser, me.isModerator))
    .then(users.findById('params.userId'))
    .else(users.publicFindById('params.userId')),
  users.respond);

app.delete('/users/:userId',
  mw.params('userId').mapValues(replaceMeWithUserId),
  or(me.isUser, me.isModerator),
  users.remove({ _id: 'params.userId' }),
  utils.message('user deleted'));

var updateUser = series(
  mw.params('userId').mapValues(replaceMeWithUserId),
  or(me.isUser, me.isModerator),
  mw.body('accounts.slack.orgs[0]').require()
    .then(
      mw.req().set('slackAccount', 'body.accounts.slack.orgs[0]'),
      settings.findOneByGithubId('slackAccount.githubId'),
      // find slackApiToken
      mw.req().set('slackApiToken', 'setting.notifications.slack.apiToken'),
      slack.create('slackApiToken'),
      slack.model.findSlackUserByUsername('slackAccount.name'),
      mw.req().set('slackUser', 'slackResult'),
      mw.req('slackUser').require()
        else(
          mw.res.status(404),
          mw.res.send('Slack user with provided username was not found')
          ),
      mw.log('slack result', 'slackResult'),
      slack.model.saveSlackAccount('params.userId', 'slackResult', 'slackAccount.githubId'),
      // just update slack account
      mw.log('update slack account should happen here'),
      users.findById('params.userId')
      )
    .else(
      mw.body(
        'name', 'company',
        'show_email', 'initial_referrer',
        'email', 'password',
        'userOptions.uiState.shownCoachMarks.editButton',
        'userOptions.uiState.shownCoachMarks.explorer',
        'userOptions.uiState.shownCoachMarks.repoList',
        'userOptions.uiState.shownCoachMarks.boxName'
      ).pick(),
      mw.body({
        or: [
          'name',
          'company',
          'show_email',
          'initial_referrer',
          'email',
          'password',
          '["userOptions.uiState.shownCoachMarks.boxName"]',
          '["userOptions.uiState.shownCoachMarks.editButton"]',
          '["userOptions.uiState.shownCoachMarks.explorer"]',
          '["userOptions.uiState.shownCoachMarks.repoList"]'
        ]
      }).require(),
      mw.body(
        '["userOptions.uiState.shownCoachMarks.boxName"]',
        '["userOptions.uiState.shownCoachMarks.editButton"]',
        '["userOptions.uiState.shownCoachMarks.explorer"]',
        '["userOptions.uiState.shownCoachMarks.repoList"]'
      ).validate(validations.isBooleanIfExists),
      users.findByIdAndUpdate('params.userId', {$set: 'body'})
    ),
  checkFound('user'),
  mw.res.json('user'));

app.patch('/users/:userId', updateUser);
