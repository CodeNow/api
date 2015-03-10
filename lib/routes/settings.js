'use strict';

var express = require('express');

var app = module.exports = express();
var mw = require('dat-middleware');
var Boom = mw.Boom;
var flow = require('middleware-flow');
var checkFound = require('middlewares/check-found');
var validations = require('middlewares/validations');
var transformations = require('middlewares/transformations');
var mongoMiddlewares = require('middlewares/mongo');
var settings = mongoMiddlewares.settings;
var me = require('middlewares/me');
var github = require('middlewares/apis').github;
var runnable = require('middlewares/apis').runnable;

var findSetting = flow.series(
  mw.params('id').require().validate(validations.isObjectId),
  settings.findById('params.id'),
  checkFound('setting'));

var validateSetting = flow.series(
  mw.body('notifications').require().then(
    mw.body('notifications.slack').require().then(
      mw.body('notifications.slack.authToken').require().string()),
    mw.body('notifications.hipchat').require().then(
      mw.body('notifications.hipchat.authToken').require().string(),
      mw.body('notifications.hipchat.roomId').require().number())
  ));

/** Create settings for an owner
 *  @returns [settings, ...]
 *  @event POST /settings
 *  @memberof module:rest/settings */
app.post('/settings',
  mw.body('owner').require()
    .then(
      mw.body('owner').validate(validations.isObject),
      mw.body('owner.github').require().number(),
      me.isOwnerOf('body'))
    .else(mw.next(Boom.badRequest('Owner is mandatory'))),
  validateSetting,
  mw.body('notifications', 'owner').pick(),
  settings.create('body'),
  settings.model.save(),
  mw.res.json(201, 'setting')
);


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
  mw.res.json('setting'));


/** Gets a array of `settings` object only with one item
 *  If `settings` do not exist for that owner - !create! new one and return.
 *  @returns Setting
 *  @event GET /settings/
 *  @memberof module:rest/settings */
app.get('/settings/',
  mw.query({or: ['owner.github', 'githubUsername']}).require(),
  mw.query('githubUsername').require()
    .then(
      github.create(),
      github.model.getUserByUsername('query.githubUsername'),
      mw.query().set('owner.github', 'githubResult.id')),
  mw.query('owner').pick(),
  mw.query('owner.github').mapValues(transformations.toInt).number(),
  me.isOwnerOf('query'),
  settings.find('query'),
  mw.req('settings').require().validate(validations.isEmptyArray).then(
    runnable.create({}, 'sessionUser'),
    runnable.model.createEmptySettings('query.owner'),
    function (req, res, next) {
      req.settings = [req.runnableResult];
      next();
    }
  ),
  mw.res.json('settings'));


/** Update settings
 *  @event PATCH rest/settings/:id
 *  @memberof module:rest/settings */
app.patch('/settings/:id',
  mw.body('notifications').pick(),
  validateSetting,
  findSetting,
  flow.or(
    me.isOwnerOf('setting'),
    me.isModerator),
  mw.body('notifications').require().then(
    mw.body('notifications.slack').require().then(
      settings.findByIdAndUpdate('params.id', {
        $set: {'notifications.slack': 'body.notifications.slack'}
      })),
    mw.body('notifications.hipchat').require().then(
      settings.findByIdAndUpdate('params.id', {
        $set: {'notifications.hipchat': 'body.notifications.hipchat'}
      }))),
  checkFound('setting'),
  mw.res.json('setting'));