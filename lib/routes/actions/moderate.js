'use strict'

var express = require('express')
var app = module.exports = express()
var mw = require('dat-middleware')
var User = require('models/mongo/user')
var me = require('middlewares/me')
var checkFound = require('middlewares/check-found')
var passport = require('middlewares/passport')
var keypather = require('keypather')()

app.post('/actions/moderate',
  me.isModerator,
  mw.req().set('_modUser', 'sessionUser'),
  function (req, res, next) {
    User.findOneByGithubUsernameAsync(keypather.get(req, 'body.username'))
    .tap(function (user) {
      req.user = user
    })
    .asCallback(function (err) {
      next(err)
    })
  },
  checkFound('user'),
  function (req, res, next) {
    req.body = {
      accessToken: keypather.get(req, 'user.accounts.github.accessToken')
    }
    next()
  },
  function (req, res, next) {
    req.session.redirect = keypather.get(req, 'query.redirect')
    next()
  },
  passport.authenticate('github-token'),
  function (req, res, next) {
    req.session.beingModerated = req._modUser
    next()
  },
  redirectIfInSession,
  mw.res.send(200))

app.post('/actions/demoderate',
  function (req, res, next) {
    if (!req.session.beingModerated) {
      // intentionally vague
      return next(mw.Boom.notFound('Bad Request'))
    }
    req.beingModeratedUsername = req.session.beingModerated.accounts.github.username
    next()
  },
  /**
   * We must get an instance of a mongoose model to find the accessToken. user.toJSON strips the
   * accessToken value.
   */
  function (req, res, next) {
    User.findOneByGithubUsernameAsync(req.beingModeratedUsername)
    .tap(function (user) {
      req.user = user
    })
    .asCallback(function (err) {
      next(err)
    })
  },
  checkFound('user'),
  function (req, res, next) {
    req.body = {
      accessToken: keypather.get(req,
        'user.accounts.github.accessToken')
    }
    next()
  },
  function (req, res, next) {
    req.session.redirect = keypather.get(req, 'query.redirect')
    next()
  },
  passport.authenticate('github-token'),
  function (req, res, next) {
    delete req.session.beingModerated
    next()
  },
  redirectIfInSession,
  mw.res.send(204))

function redirectIfInSession (req, res, next) {
  var redirect = req.session.redirect
  delete req.session.redirect
  if (redirect) {
    return res.redirect(redirect)
  }
  next()
}
