'use strict';

var express = require('express');
var app = module.exports = express();

var mw = require('dat-middleware');
var flow = require('middleware-flow');

var users = require('middlewares/mongo').users;
var me = require('middlewares/me');

app.post('/',
  mw.body('name', 'username').require(),
  me.isRegistered,
  users.create({
    isGroup: true,
    groupOwners: ['user_id'],
    groupMembers: ['user_id'],
    name: 'body.name',
    username: 'body.username',
    owner: 'user_id'
  }),
  users.model.save(),
  users.respond);

function userIsGroup (req, res, next) {
  if (!req.user.isGroup) {
    return next(mw.Boom.preconditionFailed('group does not exist at that id'));
  }
  next();
}
var findGroup = flow.series(
  users.findById('params.id'),
  users.checkFound,
  userIsGroup,
  flow.or(
    me.isOwnerOf('user'),
    me.isModerator));

app.get('/:id',
  findGroup,
  users.respond);

app.patch('/:id',
  mw.body({ or: ['name', 'company', 'groupMembers', 'groupOwners']}).pick().require(),
  findGroup,
  users.updateById('params.id', 'body'),
  users.findById('params.id'),
  users.respond);
