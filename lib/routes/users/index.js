/**
 * @module lib/routes/users/index
 */
'use strict'

var express = require('express')
var mw = require('dat-middleware')

var app = module.exports = express()
var keypather = require('keypather')()

var checkFound = require('middlewares/check-found')
var flow = require('middleware-flow')
var me = require('middlewares/me')
var requestTrace = require('middlewares/request-trace')
var requireWhitelist = require('middlewares/auth').requireWhitelist
var transformations = require('middlewares/transformations')
var User = require('models/mongo/user')
var utils = require('middlewares/utils')
var validations = require('middlewares/validations')

var or = flow.or
var series = flow.series
var replaceMeWithUserId = transformations.replaceMeWithUserId

app.get('/users/',
  requestTrace('GET_USERS'),
  mw.query({or: ['githubUsername', 'githubOrgName']}).pick().require(),
  function (req, res, next) {
    req.sessionUser.findUsersByGithubOrgNameOrUsernameAsync(req.query)
    .tap(function (users) {
      req.users = users
    })
    .asCallback(function (err) {
      next(err)
    })
  },
  mw.res.json('users'))

app.get('/users/:userId',
  requestTrace('GET_USERS_USERID'),
  mw.params('userId').mapValues(replaceMeWithUserId),
  flow.mwIf(or(me.isUser, me.isModerator))
    .then(
      function (req, res, next) {
        User.findByIdAsync(req.params.userId)
        .tap(function (user) {
          req.user = user
        })
        .asCallback(function (err) {
          next(err)
        })
      })
    .else(
      function (req, res, next) {
        User.publicFindByIdAsync(req.params.userId)
        .tap(function (user) {
          req.user = user
        })
        .asCallback(function (err) {
          next(err)
        })
      }),
  function (req, res, next) {
    if (req.session.beingModerated) {
      // toJSON it and set _beingModerated
      if (req.user.toJSON) { req.user = req.user.toJSON() }
      req.user._beingModerated = req.session.beingModerated
    }
    next()
  },
  mw.res.json('user'))

app.delete('/users/:userId',
  mw.params('userId').mapValues(replaceMeWithUserId),
  or(me.isUser, me.isModerator),
  requireWhitelist,
  function (req, res, next) {
    User.removeAsync(keypather.get(req, 'params.userId'))
    .asCallback(function (err) {
      next(err)
    })
  },
  utils.message('user deleted'))

var updateUser = series(
  requireWhitelist,
  mw.params('userId').mapValues(replaceMeWithUserId),
  or(me.isUser, me.isModerator),
  mw.body(
    'name', 'company',
    'show_email', 'initial_referrer',
    'email', 'password',
    'userOptions.uiState.shownCoachMarks.editButton',
    'userOptions.uiState.shownCoachMarks.explorer',
    'userOptions.uiState.shownCoachMarks.repoList',
    'userOptions.uiState.shownCoachMarks.boxName',
    'userOptions.uiState.previousLocation.org',
    'userOptions.uiState.previousLocation.instance'
  ).pick(),
  mw.body({
    or: [
      'name',
      'company',
      'show_email',
      'initial_referrer',
      'email',
      'password',
      '["userOptions.uiState.shownCoachMarks.boxName"]',
      '["userOptions.uiState.shownCoachMarks.editButton"]',
      '["userOptions.uiState.shownCoachMarks.explorer"]',
      '["userOptions.uiState.shownCoachMarks.repoList"]',
      '["userOptions.uiState.previousLocation.org"]',
      '["userOptions.uiState.previousLocation.instance"]'
    ]
  }).require(),
  mw.body(
    '["userOptions.uiState.shownCoachMarks.boxName"]',
    '["userOptions.uiState.shownCoachMarks.editButton"]',
    '["userOptions.uiState.shownCoachMarks.explorer"]',
    '["userOptions.uiState.shownCoachMarks.repoList"]'
  ).validate(validations.isBooleanIfExists),
  function (req, res, next) {
    User.findByIdAndUpdateAsync(req.params.userId, { $set: req.body })
    .tap(function (user) {
      req.user = user
    })
    .asCallback(function (err) {
      next(err)
    })
  },
  checkFound('user'),
  mw.res.json('user'))

app.patch('/users/:userId', updateUser)
