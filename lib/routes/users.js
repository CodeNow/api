'use strict';

var express = require('express');
var mw = require('dat-middleware');
var app = module.exports = express();
var me = require('middlewares/me');
var users = require('middlewares/mongo').users;
var tokens = require('middlewares/tokens');
var utils = require('middlewares/utils');
var transformations = require('middlewares/transformations');
var validations = require('middlewares/validations');
var isObjectId = validations.isObjectId;
var isObjectIdArray = validations.isObjectIdArray;
var replaceMeWithUserId = transformations.replaceMeWithUserId;
var toMongoQuery = transformations.toMongoQuery;
var flow = require('middleware-flow');
var or = flow.or;
var series = flow.series;

app.post('/',
  me.create(),
  tokens.createToken,
  me.model.save(),
  me.respond);

app.all('*', tokens.hasToken);

app.get('/',
  mw.query('_id', 'username').pick(),
  mw.query({ or: ['_id', 'username'] }).require(),
  mw.query('_id').require()
    .then(
      or(
        mw.query('_id').validate(isObjectId),
        mw.query('_id').validate(isObjectIdArray)),
      mw.query().transform(toMongoQuery),
      users.publicFind('query'),
      users.respond),
  mw.query('username').require()
    .then(
      users.publicFind('query'),
      users.respond)
);

app.get('/:userId',
  mw.params('userId').mapValues(replaceMeWithUserId),
  flow.mwIf(or(me.isUser, me.isModerator))
    .then(users.findById('params.userId'))
    .else(users.publicFindById('params.userId')),
  users.respond);

app.delete('/:userId',
  mw.params('userId').mapValues(replaceMeWithUserId),
  or(me.isUser, me.isModerator),
  users.remove({ _id: 'params.userId' }),
  utils.message('user deleted'));

var updateUser = series(
  mw.params('userId').mapValues(replaceMeWithUserId),
  or(me.isUser, me.isModerator),
  mw.body({ or: ['name', 'company', 'show_email', 'initial_referrer',
    'email', 'username', 'password']}).pick().require(),
  mw.body({ or: ['email', 'username', 'password'] }).require()
    .then(
      me.register,
      me.respond),
  users.findByIdAndUpdate('params.userId', 'body'),
  users.respond);

app.put('/:userId', updateUser);

app.patch('/:userId', updateUser);
