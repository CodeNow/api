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

const app = module.exports = express()

const me = require('middlewares/me')
const flow = require('middleware-flow')
const or = flow.or

app.get('/billing',
  flow.mwIf(or(me.isUser, me.isModerator))
  )

app.get('/billing/:organizationId/plan',
  function (req, res, next) {
    CreamAPI.getPlanForOrganization(req.params.organizationId)
    .tap(function (body) {
      req.creamResponse = body
    })
    .asCallback(function (err) {
      next(err)
    })
  },
  mw.res.json('creamResponse'))

app.get('/billing/:organizationId/invoices',
  function (req, res, next) {
    CreamAPI.getInvoicesForOrganization(req.params.organizationId)
    .tap(function (body) {
      req.creamResponse = body
    })
    .asCallback(function (err) {
      next(err)
    })
  },
  mw.res.json('creamResponse'))

app.get('/billing/:organizationId/payment-method',
  function (req, res, next) {
    // TODO: Only show payment method to owner
    CreamAPI.getPaymentMethodForOrganization(req.params.organizationId)
    .tap(function (body) {
      req.creamResponse = body
    })
    .asCallback(function (err) {
      next(err)
    })
  },
  mw.res.json('creamResponse'))

app.post('/billing/:organizationId/payment-method',
  flow.mwIf(or(me.isUser, me.isModerator)),
  mw.body('stripeToken').pick().require(),
  function (req, res, next) {
    let githubId = keypather.get(req, 'sessionUser.accounts.github.id')
    let stripeToken = req.body.stripeToken
    // TODO: Switch to user-service
    bigPoppaClient.getUsers({ githubId: githubId })
    .then(users => {
      if (users.length < 0) {
        throw new Error('No user')
      }
      let userId = users[0].id
      return CreamAPI.postPaymentMethodForOrganization(req.params.organizationid, stripeToken, userId)
    })
    .tap(function (body) {
      req.creamResponse = body
    })
    .asCallback(function (err) {
      next(err)
    })
  },
  mw.res.json('creamResponse'))

