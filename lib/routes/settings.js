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

var findSetting = flow.series(
  mw.params('id').require().validate(validations.isObjectId),
  settings.findById('params.id'),
  checkFound('setting'));

var validateSetting = flow.series(
  mw.body('notifications').require().then(
    mw.body('notifications.slack').require().then(
      mw.body('notifications.slack.webhookUrl').require().string()),
    mw.body('notifications.hipchat').require().then(
      mw.body('notifications.hipchat.authToken').require().string(),
      mw.body('notifications.hipchat.roomId').require().number())
  ));

/** Create settings for an owner
 *  @returns [settings, ...]
 *  @event POST /settings
 *  @memberof module:rest/settings */
 // TODO (anton) we need to validate that logged in user can create settings for the provided owner
app.post('/settings',
  mw.body('owner').require()
    .then(
      mw.body('owner').validate(validations.isObject),
      mw.body('owner.github').require().number()//,
      // me.isOwnerOf('body')
      )
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
  // flow.or(
  //   me.isOwnerOf('setting'),
  //   me.isModerator),
  mw.res.json('setting'));



// app.get('/settings/',
//   mw.query({or: ['owner.github', 'githubUsername']}).require(),
//   mw.query('githubUsername').require()
//     .then(
//       github.create(),
//       github.model.getUserByUsername('query.githubUsername'),
//       mw.query().set('owner.github', 'githubResult.id')),
//   mw.query('owner').pick(),
//   mw.query('owner.github').mapValues(transformations.toInt).number(),
//   me.isOwnerOf('query'),
//   settings.findOne('query'),
//   mw.res.json('setting'));


/** Update settings
 *  @event PATCH rest/settings/:id
 *  @memberof module:rest/settings */
app.patch('/settings/:id',
  mw.body('notifications').pick(),
  validateSetting,
  findSetting,
  // flow.or(
  //   me.isOwnerOf('setting'),
  //   me.isModerator),
  settings.findByIdAndUpdate('params.id', 'body'),
  checkFound('setting'),
  mw.res.json('setting'));