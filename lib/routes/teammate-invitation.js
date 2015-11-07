/**
 * @module lib/routes/teammateInvitation
 */
'use strict';

var express = require('express');
var mw = require('dat-middleware');

var app = module.exports = express();

var me = require('middlewares/me');
var flow = require('middleware-flow');

var or = flow.or;

var teammateInvitations = require('middlewares/mongo').teammateInvitations;

app.get('/teammate-invitation/',
  mw.query('orgName').pick().require(),
  teammateInvitations.findByGithubOrgName('query.orgName'),
  mw.res.json('teammateInvitations'));

app.post('/teammate-invitation/',
  mw.params('email', 'orgName', 'githubUserId').pick().require(),
  mw.params('githubUserId').mapValues(parseInt),
  teammateInvitations.create({
    email: 'params.email',
    githubUserId: 'params.githubUserId',
    orgName: 'params.orgName',
    createdBy: 'sessionUser._id'
  }),
  teammateInvitations.model.save(),
  mw.res.json(201, 'teammateInvitations'));

app.delete('/teammate-invitation/',
  mw.params('id').pick().require(),
  or(me.isUser, me.isModerator),
  teammateInvitations.remove({ _id: 'params.id' }),
  mw.res.json('teammateInvitations'));
