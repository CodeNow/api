/**
 * @module lib/routes/teammateInvitation
 */
'use strict'

const express = require('express')
const mw = require('dat-middleware')
const keypather = require('keypather')()

const BigPoppaClient = require('@runnable/big-poppa-client')
const bigPoppaClient = new BigPoppaClient(process.env.BIG_POPPA_HOST)
const Boom = require('dat-middleware').Boom
const CreamAPI = require('models/apis/cream')
const logger = require('middlewares/logger')(__filename)
const log = logger.log

const app = module.exports = express()

const me = require('middlewares/me')
const flow = require('middleware-flow')
const or = flow.or

const getBigPoppaUserId = (githubId) => {
  return bigPoppaClient.getUsers({ githubId: githubId })
    .then(users => {
      log.trace({ users: users }, 'getUsers resposne')
      if (users.length < 0) {
        throw Boom.notFound('There is no users with this githubId', { githubId: githubId })
      }
      return users[0].id
    })
}

app.get('/billing/plan/',
  flow.mwIf(or(me.isUser, me.isModerator)),
  mw.query('organizationId').require(),
  function (req, res, next) {
    log.trace({ organizationId: req.query.organizationId }, 'plan route')
    CreamAPI.getPlanForOrganization(req.query.organizationId)
    .tap(function (body) {
      log.trace({ body: body }, 'final http response')
      req.creamResponse = body
    })
    .asCallback(function (err) {
      next(err)
    })
  },
  mw.res.json('creamResponse'))

app.get('/billing/invoices/',
  flow.mwIf(or(me.isUser, me.isModerator)),
  mw.query('organizationId').require(),
  function (req, res, next) {
    log.trace({ organizationId: req.query.organizationId }, 'invoices route')
    CreamAPI.getInvoicesForOrganization(req.query.organizationId)
    .tap(function (body) {
      log.trace({ body: body }, 'final http response')
      req.creamResponse = body
    })
    .asCallback(function (err) {
      next(err)
    })
  },
  mw.res.json('creamResponse'))

app.get('/billing/payment-method/',
  flow.mwIf(or(me.isUser, me.isModerator)),
  mw.query('organizationId').require(),
  function (req, res, next) {
    let githubId = keypather.get(req, 'sessionUser.accounts.github.id')
    log.trace({ organizationId: req.query.organizationId, githubId: githubId }, 'payment-method route')
    Promise.all([
      CreamAPI.getPaymentMethodForOrganization(req.query.organizationId),
      getBigPoppaUserId(githubId)
    ])
    .spread((body, userId) => {
      log.trace({ userId: userId, body: body }, 'getUsers resposne')
      if (keypather.get(body, 'owner.id') !== userId) {
        throw Boom.forbidden('This user is not the owner of this payment method', { userId: userId })
      }
      req.creamResponse = body
    })
    .asCallback(function (err) {
      next(err)
    })
  },
  mw.res.json('creamResponse'))

app.post('/billing/payment-method/',
  flow.mwIf(or(me.isUser, me.isModerator)),
  mw.body('stripeToken').require(),
  mw.query('organizationId').require(),
  function (req, res, next) {
    let githubId = keypather.get(req, 'sessionUser.accounts.github.id')
    let stripeToken = req.body.stripeToken
    log.trace({ githubId: githubId, stripeToken: stripeToken }, 'get stripeToken and githubId')
    // TODO: Switch to user-service
    getBigPoppaUserId(githubId)
    .then(userId => {
      log.trace({ userId: userId }, 'getUsers resposne')
      return CreamAPI.postPaymentMethodForOrganization(req.query.organizationId, stripeToken, userId)
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

