/**
 * @module lib/routes/users/index
 */
'use strict'

var express = require('express')
var mw = require('dat-middleware')

var app = module.exports = express()

var checkFound = require('middlewares/check-found')
var flow = require('middleware-flow')
// var logger = require('middlewares/logger')(__filename)
var me = require('middlewares/me')
var requestTrace = require('middlewares/request-trace')
var transformations = require('middlewares/transformations')
var users = require('middlewares/mongo').users
var utils = require('middlewares/utils')
var validations = require('middlewares/validations')

var or = flow.or
var series = flow.series
var replaceMeWithUserId = transformations.replaceMeWithUserId

app.get('/users/test/',
  mw.req().set('user', 'sessionUser'),
  mw.query('githubOrgName').pick().require(),
  users.model.findGithubOrgMembersByOrgName('query.githubOrgName'),
  mw.res.json('users'))

app.get('/users/',
  requestTrace('GET_USERS'),
  mw.query('githubUsername').pick().require(),
  users.publicFindByGithubUsername('githubUsername'),
  mw.res.json('users'))

app.get('/users/:userId',
  requestTrace('GET_USERS_USERID'),
  mw.params('userId').mapValues(replaceMeWithUserId),
  flow.mwIf(or(me.isUser, me.isModerator))
    .then(users.findById('params.userId'))
    .else(users.publicFindById('params.userId')),
  function (req, res, next) {
    if (req.session.beingModerated) {
      // toJSON it and set _beingModerated
      if (req.user.toJSON) { req.user = req.user.toJSON() }
      req.user._beingModerated = req.session.beingModerated
    }
    next()
  },
  users.respond)

app.delete('/users/:userId',
  mw.params('userId').mapValues(replaceMeWithUserId),
  or(me.isUser, me.isModerator),
  users.remove({ _id: 'params.userId' }),
  utils.message('user deleted'))

var updateUser = series(
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
  users.findByIdAndUpdate('params.userId', { $set: 'body' }),
  checkFound('user'),
  mw.res.json('user'))

app.patch('/users/:userId', updateUser)
