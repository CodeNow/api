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

app.get('/teammate-invitation/:orgName',
  mw.params('orgName').pick().require(),
  teammateInvitations.findByGithubOrgName('params.orgName'),
  mw.res.json('teammateInvitations'));

app.post('/teammate-invitation/',
  mw.query('email', 'orgName', 'githubUserId').pick().require(),
  mw.query('githubUserId').mapValues(parseInt),
  teammateInvitations.create({
    email: 'query.email',
    githubUserId: 'query.githubUserId',
    orgName: 'query.orgName',
    createdBy: 'sessionUser._id'
  }),
  teammateInvitations.model.save(),
  mw.res.json(201, 'teammateInvitation'));

app.delete('/teammate-invitation/:id',
  mw.params('id').pick().require(),
  or(me.isUser, me.isModerator),
  teammateInvitations.remove({ _id: 'params.id' }),
  mw.res.json('teammateInvitations'));
