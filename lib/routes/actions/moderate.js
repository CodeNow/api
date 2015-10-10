'use strict';

var express = require('express');
var app = module.exports = express();
var mw = require('dat-middleware');
var users = require('middlewares/mongo').users;
var me = require('middlewares/me');
var checkFound = require('middlewares/check-found');
var passport = require('middlewares/passport');
var keypather = require('keypather')();

app.post('/actions/moderate',
  me.isModerator,
  mw.req().set('_modUser', 'sessionUser'),
  users.findOneByGithubUsername('body.username'),
  checkFound('user'), function(req, res, next) {
    req.body = {
      accessToken: keypather.get(req, 'user.accounts.github.accessToken')
    };
    next();
  }, function(req, res, next) {
    req.session.redirect = keypather.get(req, 'query.redirect');
    next();
  },
  passport.authenticate('github-token'), function(req, res, next) {
    req.session.beingModerated = req._modUser;
    next();
  },
  redirectIfInSession,
  mw.res.send(200));

app.post('/actions/demoderate', function(req, res, next) {
  if (!req.session.beingModerated) {
    // intentionally vague
    return next(mw.Boom.notFound('Bad Request'));
  }
  req.body = {
    accessToken: keypather.get(req,
      'session.beingModerated.accounts.github.accessToken')
  };
  next();
}, function(req, res, next) {
  req.session.redirect = keypather.get(req, 'query.redirect');
  next();
},
  passport.authenticate('github-token'), function(req, res, next) {
    delete req.session.beingModerated;
    next();
  },
  redirectIfInSession,
  mw.res.send(204));

function redirectIfInSession(req, res, next) {
  var redirect = req.session.redirect;
  delete req.session.redirect;
  if (redirect) {
    return res.redirect(redirect);
  }
  next();
}
