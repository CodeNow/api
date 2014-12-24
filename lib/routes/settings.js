'use strict';

var express = require('express');

var app = module.exports = express();
var mw = require('dat-middleware');

var validations = require('middlewares/validations');
var mongoMiddlewares = require('middlewares/mongo');
var settings = mongoMiddlewares.settings;


/** Create settings for an owner
 *  @returns [settings, ...]
 *  @event POST /settings
 *  @memberof module:rest/settings */
app.post('/settings',
  mw.body('owner').require()
    .then(
      mw.body('owner').validate(validations.isObject),
      mw.body('owner.github').require().number()),
  settings.create({
    owner: {
      github: 'body.owner.github'
    },
    notifications: {
      slack: 'body.notifications.slack',
      hipchat: 'body.notifications.hipchat'
    }
  }),
  settings.model.save(),
  mw.res.json(201, 'settings')
);
