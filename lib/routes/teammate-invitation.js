/**
 * @module lib/routes/teammateInvitation
 */
'use strict'

var express = require('express')
var mw = require('dat-middleware')
var keypather = require('keypather')()

var app = module.exports = express()

var me = require('middlewares/me')
var SendGrid = require('models/apis/sendgrid')
var Promise = require('bluebird')
var ErrorCat = require('error-cat')
var error = new ErrorCat()

var flow = require('middleware-flow')

var or = flow.or

var TeammateInvitation = require('models/mongo/teammate-invitation')
var checkFound = require('middlewares/check-found')

app.get('/teammate-invitation/',
  mw.query('orgGithubId').pick().require(),
  mw.query('orgGithubId').mapValues(parseInt),
  flow.mwIf(or(me.isUser, me.isModerator)),
  mw.req().set('body.githubOrg.owner.github', 'query.orgGithubId'),
  flow.or(
    me.isOwnerOf('body.githubOrg'),
    me.isModerator),
  function (req, res, next) {
    TeammateInvitation.findByGithubOrgAsync(req.query.orgGithubId)
    .tap(function (model) {
      req.teammateInvitations = model
    })
    .asCallback(function (err) {
      next(err)
    })
  },
  mw.res.json('teammateInvitations'))

/**
 * Create a new invitation, and send an email to invite someone
 *
 * @param {Boolean} body.admin - true if this is meant for inviting an admin
 * @param {String}  body.emailMessage - body text of the email (usually only for admins)
 * @param {Number}  body.organization.github - github id of the user's org
 * @param {Number}  body.recipient.github - github id of the recipient of this invitation
 * @param {String}  body.recipient.email - email address to where this email is going
 *
 */
app.post('/teammate-invitation/',
  mw.body('recipient.github').mapValues(parseInt),
  mw.body('organization.github').mapValues(parseInt),
  flow.mwIf(or(me.isUser, me.isModerator)),
  mw.req().set('body.githubOrg.owner', 'body.organization'),
  flow.or(
    me.isOwnerOf('body.githubOrg'),
    me.isModerator),
  function (req, res, next) {
    return Promise.try(function () {
      var sendGrid = new SendGrid()
      if (req.body.admin) {
        return sendGrid.inviteAdmin(
          req.body.recipient,
          req.sessionUser,
          req.body.emailMessage
        )
      } else {
        return sendGrid.inviteUser(
          req.body.recipient,
          req.sessionUser,
          req.body.organization.github
        )
      }
    })
      .asCallback(function (err) {
        // Do not remove this handler.  If it's not here, the Domain totally messes up and this
        // session gets stuck in it
        if (err) {
          var inviteError = error.wrap(err, 500, err.message)
          error.report(inviteError)
          return next(inviteError)
        }
        next()
      })
  },
  function (req, res, next) {
    TeammateInvitation.createAsync({
      organization: {
        github: keypather.get(req, 'body.organization.github')
      },
      recipient: {
        github: keypather.get(req, 'body.recipient.github'),
        email: keypather.get(req, 'body.recipient.email')
      },
      owner: {
        github: keypather.get(req, 'sessionUser.accounts.github.id')
      }
    })
    .tap(function (model) {
      req.teammateInvitation = model
    })
    .asCallback(function (err) {
      next(err)
    })
  },
  mw.res.json(201, 'teammateInvitation'))

app.delete('/teammate-invitation/:id',
  mw.params('id').pick().require(),
  flow.series(
    function (req, res, next) {
      TeammateInvitation.findByIdAsync(req.params.id)
      .tap(function (model) {
        req.teammateInvitation = model
      })
      .asCallback(function (err) {
        next(err)
      })
    },
    checkFound('teammateInvitation')),
  flow.or(
    me.isOwnerOf('teammateInvitation'),
    me.isModerator),
  function (req, res, next) {
    TeammateInvitation.removeAsync(req.params.id)
    .asCallback(function (err) {
      next(err)
    })
  },
  mw.res.send(204))
