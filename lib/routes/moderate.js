'use strict';

var express = require('express');
var app = module.exports = express();
var mw = require('dat-middleware');
var users = require('middlewares/mongo').users;
var me = require('middlewares/me');
var checkFound = require('middlewares/check-found');
var passport = require('middlewares/passport');
var keypather = require('keypather')();

app.post('/moderate',
  me.isModerator,
  mw.req().set('_modUser', 'sessionUser'),
  users.findOneByGithubUsername('body.username'),
  checkFound('user'),
  function (req, res, next) {
    req.body = {
      accessToken: keypather.get(req, 'user.accounts.github.accessToken')
    };
    next();
  },
  passport.authenticate('github-token'),
  function (req, res, next) {
    req.session.beingModerated = req._modUser;
    next();
  },
  function (req, res, next) {
    if (req.params.redirect) {
      return res.redirect(req.params.redirect);
    }
    next();
  },
  mw.res.send(200));

app.delete('/moderate',
  function (req, res, next) {
    if (!req.session.beingModerated) {
      // intentionally vague
      return next(mw.Boom.notFound('Bad Request'));
    }
    req.body = {
      accessToken: keypather.get(req,
        'session.beingModerated.accounts.github.accessToken')
    };
    next();
  },
  passport.authenticate('github-token'),
  function (req, res, next) {
    if (req.params.redirect) {
      return res.redirect(req.params.redirect);
    }
    next();
  },
  mw.res.send(204));
