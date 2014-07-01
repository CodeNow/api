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
    groupOwners: ['sessionUser._id'],
    groupMembers: ['sessionUser._id'],
    name: 'body.name',
    username: 'body.username',
    lowerUsername: 'body.username.toLowerCase()',
    owner: 'sessionUser._id'
  }),
  users.model.save(),
  mw.res.json(201, 'user'));

var findGroup = flow.series(
  users.findById('params.id'),
  users.checkFound,
  users.isGroup,
  flow.or(
    me.isOwnerOf('user'),
    me.isModerator));

app.get('/:id',
  findGroup,
  mw.res.json('user'));

app.patch('/:id',
  mw.body({ or: ['name', 'company', 'groupMembers', 'groupOwners']}).pick().require(),
  findGroup,
  users.updateById('params.id', 'body'),
  users.findById('params.id'),
  mw.res.json('user'));
