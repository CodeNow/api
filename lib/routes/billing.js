/**
 * @module lib/routes/billing
 */
'use strict'

const express = require('express')
const keypather = require('keypather')()

const BillingService = require('models/services/billing-service')
const logger = require('middlewares/logger')(__filename)
const log = logger.log

const app = module.exports = express()

const responseHandler = function (res, next, err, json) {
  if (err) {
    log.trace({ err: err }, 'responseHandler error')
    return next(err)
  }
  log.trace({ json: json }, 'responseHandler response')
  return res.json(json)
}
module.exports.responseHandler = responseHandler

app.get('/billing/plan/',
  function (req, res, next) {
    var organizationId = parseInt(keypather.get(req, 'query.organizationId'), 10)
    var githubId = keypather.get(req, 'sessionUser.accounts.github.id')
    var token = keypather.get(req, 'sessionUser.accounts.github.accessToken')
    log.trace({ organizationId: req.query.organizationId, githubId: githubId }, 'plan route')
    BillingService.getPlanForOrganization(organizationId, githubId, token)
      .asCallback(responseHandler.bind(null, res, next))
  })

app.get('/billing/invoices/',
  function (req, res, next) {
    var organizationId = parseInt(keypather.get(req, 'query.organizationId'), 10)
    var githubId = keypather.get(req, 'sessionUser.accounts.github.id')
    var token = keypather.get(req, 'sessionUser.accounts.github.accessToken')
    log.trace({ organizationId: req.query.organizationId, githubId: githubId }, 'invoices route')
    BillingService.getInvoicesForOrganization(organizationId, githubId, token)
      .asCallback(responseHandler.bind(null, res, next))
  })

app.get('/billing/payment-method/',
  function (req, res, next) {
    var organizationId = parseInt(keypather.get(req, 'query.organizationId'), 10)
    var githubId = keypather.get(req, 'sessionUser.accounts.github.id')
    var token = keypather.get(req, 'sessionUser.accounts.github.accessToken')
    log.trace({ organizationId: req.query.organizationId, githubId: githubId }, 'payment-method route')
    BillingService.getPaymentMethodForOrganization(organizationId, githubId, token)
      .asCallback(responseHandler.bind(null, res, next))
  })

app.post('/billing/payment-method/',
  function (req, res, next) {
    var organizationId = parseInt(keypather.get(req, 'query.organizationId'), 10)
    var githubId = keypather.get(req, 'sessionUser.accounts.github.id')
    var stripeToken = keypather.get(req, 'body.stripeToken')
    log.trace({ organizationId: organizationId, githubId: githubId, stripeToken: stripeToken }, 'get stripeToken and githubId')
    BillingService.postPaymentMethodForOrganization(organizationId, githubId, stripeToken)
      .asCallback(responseHandler.bind(null, res, next))
  })

