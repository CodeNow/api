'use strict';

var express = require('express');
var app = module.exports = express();
var mw = require('dat-middleware');
var users = require('middlewares/mongo').users;
var me = require('middlewares/me');
var checkFound = require('middlewares/check-found');

app.patch('/moderate/:githubUsername',
  me.isModerator,
  users.findOneByGithubUsername('params.githubUsername'),
  checkFound('user'),
  function (req, res, next) {
    req.session.beingModerated = req.sessionUser;
    next();
  },
  mw.req.send(200));
