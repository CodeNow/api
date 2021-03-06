/**
 * @module lib/routes/settings
 */
'use strict'

var express = require('express')
var flow = require('middleware-flow')
var mw = require('dat-middleware')
var keypather = require('keypather')()

var checkFound = require('middlewares/check-found')
var GitHub = require('models/apis/github')
var me = require('middlewares/me')
var transformations = require('middlewares/transformations')
var validations = require('middlewares/validations')
var SettingsService = require('models/services/settings-service')
var Settings = require('models/mongo/settings')

var app = module.exports = express()

var findSetting = flow.series(
  mw.params('id').require().validate(validations.isObjectId),
  function (req, res, next) {
    Settings.findByIdAsync(req.params.id)
    .tap(function (setting) {
      req.setting = setting
    })
    .asCallback(function (err) {
      next(err)
    })
  },
  checkFound('setting'))

var validateSetting = flow.series(
  mw.body('notifications.slack').require().then(
    mw.body('notifications.slack.apiToken').require().string()))

/** Create settings for an owner
 *  @returns [settings, ...]
 *  @event POST /settings
 *  @memberof module:rest/settings */
app.post('/settings',
  function (req, res, next) {
    SettingsService.createNew(req.sessionUser, req.body)
      .then(function (setting) {
        req.setting = setting
        next()
      })
      .catch(next)
  },
  mw.res.json(201, 'setting')
)

/** Gets a specific settings by id
 *  @param id settingId of the setting to return
 *  @returns Setting
 *  @event GET /settings/:id
 *  @memberof module:rest/settings */
app.get('/settings/:id',
  findSetting,
  flow.or(
    me.isOwnerOf('setting'),
    me.isModerator),
  mw.res.json('setting'))

/** Gets a array of `settings` object only with one item
 *  If `settings` do not exist for that owner - !create! new one and return.
 *  @returns Setting
 *  @event GET /settings/
 *  @memberof module:rest/settings */
app.get('/settings/',
  mw.query({or: ['owner.github', 'githubUsername']}).require(),
  mw.query('githubUsername').require()
    .then(
      function (req, res, next) {
        var github = new GitHub({
          token: keypather.get(req, 'sessionUser.accounts.github.accessToken')
        })
        github.getUserByUsernameAsync(keypather.get(req, 'query.githubUsername'))
        .tap(function (result) {
          keypather.set(req.query, 'owner.github', result.id)
        })
        .asCallback(next)
      }),
  mw.query('owner').pick(),
  mw.query('owner.github').mapValues(transformations.toInt).number(),
  me.isOwnerOf('query'),
  function (req, res, next) {
    Settings.findAsync(req.query)
    .tap(function (settings) {
      req.settings = settings
    })
    .asCallback(function (err) {
      next(err)
    })
  },
  mw.req('settings').require().validate(validations.isEmptyArray).then(
    function (req, res, next) {
      SettingsService.createNew(
        req.sessionUser,
        { owner: req.query.owner })
      .then(function (setting) {
        req.settings = [setting]
        next()
      })
      .catch(next)
    }),
  mw.res.json('settings'))

/** Update settings
 *  @event PATCH rest/settings/:id
 *  @memberof module:rest/settings */
app.patch('/settings/:id',
  mw.body('notifications', 'ignoredHelpCards').pick(),
  validateSetting,
  findSetting,
  flow.or(
    me.isOwnerOf('setting'),
    me.isModerator),
  mw.body('notifications').require().then(
    mw.body('notifications.slack').require().then(
      function (req, res, next) {
        Settings.findByIdAndUpdateAsync(req.params.id, {
          $set: { 'notifications.slack': keypather.get(req, 'body.notifications.slack') }
        })
        .asCallback(function (err) {
          next(err)
        })
      })),
  mw.body('ignoredHelpCards').require().then(
    function (req, res, next) {
      Settings.findByIdAndUpdateAsync(req.params.id, {
        $set: { 'ignoredHelpCards': keypather.get(req, 'body.ignoredHelpCards') }
      })
      .asCallback(function (err) {
        next(err)
      })
    }),
  findSetting,
  mw.res.json('setting'))
