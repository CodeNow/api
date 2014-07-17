'use strict';

var express = require('express');
var app = module.exports = express();
var checkFound = require('middlewares/check-found');
var github = require('middlewares/apis').github;
var users = require('middlewares/mongo').users;
var me = require('middlewares/me');
var replaceMeWithUserId = require('middlewares/transformations').replaceMeWithUserId;
var mw = require('dat-middleware');
var flow = require('middleware-flow');

app.get('/:userId/github/orgs',
  mw.params('userId').mapValues(replaceMeWithUserId),
  users.findById('params.userId'),
  checkFound('user'),
  flow.or(me.isUser, me.isModerator),
  github.create({ token: 'sessionUser.accounts.github.accessToken' }),
  github.model.getUserAuthorizedOrgs('user.accounts.github.id'),
  checkFound('githubResult'),
  mw.res.send(200, 'githubResult'));
