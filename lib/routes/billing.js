/**
 * @module lib/routes/teammateInvitation
 */
'use strict'

const express = require('express')
const mw = require('dat-middleware')
const keypather = require('keypather')()

const BigPoppaClient = require('@runnable/big-poppa-client')
const bigPoppaClient = new BigPoppaClient(process.env.BIG_POPPA_HOST)
const CreamAPI = require('models/api/cream')
const log = require('middlewares/logger')(__filename).logger

const app = module.exports = express()

const me = require('middlewares/me')
const flow = require('middleware-flow')
const or = flow.or

app.get('/billing/:id/plan/',
  flow.mwIf(or(me.isUser, me.isModerator)),
  function (req, res, next) {
    log.trace({ organizationId: req.params.id }, 'plan route')
    CreamAPI.getPlanForOrganization(req.params.id)
    .tap(function (body) {
      log.trace({ body: body }, 'final http response')
      req.creamResponse = body
    })
    .asCallback(function (err) {
      next(err)
    })
  },
  mw.res.json('creamResponse'))

app.get('/billing/:id/invoices/',
  flow.mwIf(or(me.isUser, me.isModerator)),
  function (req, res, next) {
    log.trace({ organizationId: req.params.id }, 'invoices route')
    CreamAPI.getInvoicesForOrganization(req.params.id)
    .tap(function (body) {
      log.trace({ body: body }, 'final http response')
      req.creamResponse = body
    })
    .asCallback(function (err) {
      next(err)
    })
  },
  mw.res.json('creamResponse'))

app.get('/billing/:id/payment-method/',
  flow.mwIf(or(me.isUser, me.isModerator)),
  function (req, res, next) {
    log.trace({ organizationId: req.params.id }, 'payment-method route')
    // TODO: Only show payment method to owner
    CreamAPI.getPaymentMethodForOrganization(req.params.id)
    .tap(function (body) {
      log.trace({ body: body }, 'final http response')
      req.creamResponse = body
    })
    .asCallback(function (err) {
      next(err)
    })
  },
  mw.res.json('creamResponse'))

app.post('/billing/:id/payment-method/',
  flow.mwIf(or(me.isUser, me.isModerator)),
  mw.body('stripeToken').pick().require(),
  function (req, res, next) {
    let githubId = keypather.get(req, 'sessionUser.accounts.github.id')
    let stripeToken = req.body.stripeToken
    log.trace({ githubId: githubId, stripeToken: stripeToken }, 'get stripeToken and githubId')
    // TODO: Switch to user-service
    bigPoppaClient.getUsers({ githubId: githubId })
    .then(users => {
      log.trace({ users: users }, 'getUsers resposne')
      if (users.length < 0) {
        throw new Error('No user')
      }
      let userId = users[0].id
      return CreamAPI.postPaymentMethodForOrganization(req.params.id, stripeToken, userId)
    })
    .tap(function (body) {
      log.trace({ body: body }, 'final http response')
      req.creamResponse = body
    })
    .asCallback(function (err) {
      next(err)
    })
  },
  mw.res.json('creamResponse'))

