'use strict';

var express = require('express');
var app = module.exports = express();
var mw = require('dat-middleware');
var users = require('middlewares/mongo').users;
var me = require('middlewares/me');
var checkFound = require('middlewares/check-found');
var passport = require('middlewares/passport');
var keypather = require('keypather')();

app.patch('/moderate/:githubUsername',
  me.isModerator,
  users.findOneByGithubUsername('params.githubUsername'),
  checkFound('user'),
  function (req, res, next) {
    req.body = {
      accessToken: keypather.get(req, 'user.accounts.github.accessToken')
    };
    next();
  },
  passport.authenticate('github-token'),
  function (req, res, next) {
    req.session.beingModerated = req.sessionUser;
    next();
  },
  mw.res.send(200));
