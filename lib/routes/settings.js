'use strict';

var express = require('express');

var app = module.exports = express();
var mw = require('dat-middleware');
var Boom = mw.Boom;
var flow = require('middleware-flow');
var checkFound = require('middlewares/check-found');
var validations = require('middlewares/validations');
var mongoMiddlewares = require('middlewares/mongo');
var settings = mongoMiddlewares.settings;


var findSetting = flow.series(
  mw.params('id').require().validate(validations.isObjectId),
  settings.findById('params.id'),
  checkFound('setting'));

var validateSettings = flow.series(
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
app.post('/settings',
  mw.body('owner').require()
    .then(
      mw.body('owner').validate(validations.isObject),
      mw.body('owner.github').require().number())
    .else(mw.next(Boom.badRequest('Owner is mandatory'))),
  validateSettings,
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
  mw.res.json('setting'));


/** Update settings
 *  @event PATCH rest/settings/:id
 *  @memberof module:rest/settings */
app.patch('/settings/:id',
  validateSettings,
  mw.body('owner').require()
    .then(
      mw.body('owner').validate(validations.isObject),
      mw.body('owner.github').require().number()),
  findSetting,
  settings.findByIdAndUpdate('params.id', 'body'),
  checkFound('setting'),
  mw.res.json('setting'));