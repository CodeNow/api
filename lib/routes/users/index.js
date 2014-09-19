'use strict';

var express = require('express');
var mw = require('dat-middleware');
var app = module.exports = express();
var me = require('middlewares/me');
var users = require('middlewares/mongo').users;
var utils = require('middlewares/utils');
var transformations = require('middlewares/transformations');
var replaceMeWithUserId = transformations.replaceMeWithUserId;
var flow = require('middleware-flow');
var or = flow.or;
var series = flow.series;
var checkFound = require('middlewares/check-found');

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
  mw.body({ or: ['name', 'company', 'show_email', 'initial_referrer',
    'email', 'password']}).pick().require(),
  users.findByIdAndUpdate('params.userId', 'body'),
  checkFound('user'),
  mw.res.json('user'));

app.patch('/users/:userId', updateUser);
