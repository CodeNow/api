'use strict';

var express = require('express');
var mw = require('dat-middleware');
var app = module.exports = express();
var users = require('mongooseware')(require('models/mongo/user'));
var transformations = require('middlewares/transformations');
var replaceMeWithUserId = transformations.replaceMeWithUserId;
var me = require('middlewares/me');
var flow = require('middleware-flow');
var or = flow.or;

app.post('/users/:userId/routes/',
  mw.body('srcHostname').require(),
  mw.body('destInstanceId').require(),
  mw.params('userId').mapValues(replaceMeWithUserId),
  flow.mwIf(or(me.isUser, me.isModerator)),
  users.findById('params.userId').exec('user'),
  users.model.mapRoute('body.srcHostname', 'body.destInstanceId'),
  mw.res.json(201, 'user.routes'));

app.get('/users/:userId/routes',
  mw.params('userId').mapValues(replaceMeWithUserId),
  flow.mwIf(or(me.isUser, me.isModerator)),
  users.findById('params.userId').exec('user'),
  mw.res.json(200, 'user.routes'));

app.delete('/users/:userId/routes/:source',
  mw.params('userId').mapValues(replaceMeWithUserId),
  flow.mwIf(or(me.isUser, me.isModerator)),
  users.findById('params.userId').exec('user'),
  users.model.removeRoute('params.source'),
  mw.res.status(204),
  mw.res.end());
