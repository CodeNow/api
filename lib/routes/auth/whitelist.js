'use strict';

/** @module lib/routes/auth/whitelist */

var express = require('express');
var app = module.exports = express();

var mw = require('dat-middleware');
var flow = require('middleware-flow');
var checkFound = require('middlewares/check-found');

var userWhitelist = require('mongooseware')(require('models/mongo/user-whitelist'));
var github = require('middlewarize')(require('models/apis/github'));

app.all('/auth/whitelist*',
  // only allow people in the Runnable team add people
  github.new({ token: 'sessionUser.accounts.github.accessToken' }),
  flow.or(
    github.instance.isOrgMember('Runnable', 'cb'),
    github.instance.isOrgMember('CodeNow', 'cb')));

/** add a name to the whitelist
 *  @params body.name name of the user or org
 *  @event POST rest/auth/whitelist
 *  @memberof module:lib/routes/auth/whitelist */
app.post('/auth/whitelist',
  mw.body('name').pick(),
  mw.body('name').require().string(),
  userWhitelist.create({
    name: 'body.name',
    allowed: true
  }),
  mw.res.json(201, 'userwhitelist'));

/** remove a name from the whitelist
 *  @params body.name name of the user or org
 *  @event DELETE rest/auth/whitelist
 *  @memberof module:lib/routes/auth/whitelist */
app.delete('/auth/whitelist/:name',
  mw.params('name').pick(),
  mw.params('name').require().string(),
  userWhitelist.findOne({
    lowerName: 'params.name.toLowerCase()'
  }),
  checkFound('userwhitelist'),
  userWhitelist.remove({
    _id: 'userwhitelist._id'
  }),
  mw.res.send(204));

