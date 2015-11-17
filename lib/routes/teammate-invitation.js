/**
 * @module lib/routes/teammateInvitation
 */
'use strict'

var express = require('express')
var mw = require('dat-middleware')

var app = module.exports = express()

var me = require('middlewares/me')
var flow = require('middleware-flow')

var or = flow.or

var teammateInvitations = require('middlewares/mongo').teammateInvitations

app.get('/teammate-invitation/',
  mw.query('orgGithubId').pick().require(),
  mw.query('orgGithubId').mapValues(parseInt),
  flow.mwIf(or(me.isUser, me.isModerator)),
  mw.req().set('body.githubOrg.owner.github', 'query.orgGithubId'),
  flow.or(
    me.isOwnerOf('body.githubOrg'),
    me.isModerator),
  teammateInvitations.findByGithubOrg('query.orgGithubId'),
  mw.res.json('teammateInvitations'))

app.post('/teammate-invitation/',
  mw.body('recipient.github').mapValues(parseInt),
  mw.body('organization.github').mapValues(parseInt),
  flow.mwIf(or(me.isUser, me.isModerator)),
  teammateInvitations.create({
    organization: {
      github: 'body.organization.github'
    },
    recipient: {
      github: 'body.recipient.github',
      email: 'body.recipient.email'
    },
    owner: {
      github: 'sessionUser.accounts.github.id'
    }
  }),
  teammateInvitations.model.save(),
  mw.res.json(201, 'teammateInvitation'))

app.delete('/teammate-invitation/:id',
  mw.params('id').pick().require(),
  flow.mwIf(or(me.isUser, me.isModerator)),
  teammateInvitations.remove({ _id: 'params.id' }),
  mw.res.send(204))
