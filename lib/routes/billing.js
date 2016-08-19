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

app.get('/billing/plan/',
  function (req, res, next) {
    let organizationId = keypather.get(req, 'query.organizationId')
    log.trace({ organizationId: req.query.organizationId }, 'plan route')
    BillingService.getPlanForOrganization(organizationId)
      .then(body => res.json(body))
      .asCallback(err => next(err))
  })

app.get('/billing/invoices/',
  function (req, res, next) {
    let organizationId = keypather.get(req, 'query.organizationId')
    log.trace({ organizationId: req.query.organizationId }, 'invoices route')
    BillingService.getInvoicesForOrganization(organizationId)
      .then(body => res.json(body))
      .asCallback(err => next(err))
  })

app.get('/billing/payment-method/',
  function (req, res, next) {
    let organizationId = keypather.get(req, 'query.organizationId')
    let githubId = keypather.get(req, 'sessionUser.accounts.github.id')
    log.trace({ organizationId: req.query.organizationId, githubId: githubId }, 'payment-method route')
    BillingService.getPaymentMethodForOrganization(organizationId, githubId)
      .then(body => res.json(body))
      .asCallback(err => next(err))
  })

app.post('/billing/payment-method/',
  function (req, res, next) {
    let organizationId = keypather.get(req, 'query.organizationId')
    let githubId = keypather.get(req, 'sessionUser.accounts.github.id')
    let stripeToken = keypather.get(req, 'body.stripeToken')
    log.trace({ githubId: githubId, stripeToken: stripeToken }, 'get stripeToken and githubId')
    BillingService.postPaymentMethodForOrganization(organizationId, githubId, stripeToken)
      .then(body => res.json(body))
      .asCallback(err => next(err))
  })

