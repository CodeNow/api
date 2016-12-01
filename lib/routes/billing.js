/**
 * @module lib/routes/billing
 */
'use strict'

const express = require('express')
const keypather = require('keypather')()

const BillingService = require('models/services/billing-service')
const logger = require('middlewares/logger')(__filename)
const log = logger.log
const jsonResponseHanlder = require('routes/promise-response-handler').jsonResponseHanlder

const app = module.exports = express()

app.get('/billing/plan/',
  function (req, res, next) {
    let organizationId = parseInt(keypather.get(req, 'query.organizationId'), 10)
    let githubId = keypather.get(req, 'sessionUser.accounts.github.id')
    let token = keypather.get(req, 'sessionUser.accounts.github.accessToken')
    log.trace({ organizationId: req.query.organizationId, githubId: githubId }, 'plan route')
    BillingService.getPlanForOrganization(organizationId, githubId, token)
      .asCallback(jsonResponseHanlder.bind(null, res, next))
  })

app.get('/billing/invoices/',
  function (req, res, next) {
    let organizationId = parseInt(keypather.get(req, 'query.organizationId'), 10)
    let githubId = keypather.get(req, 'sessionUser.accounts.github.id')
    let token = keypather.get(req, 'sessionUser.accounts.github.accessToken')
    log.trace({ organizationId: req.query.organizationId, githubId: githubId }, 'invoices route')
    BillingService.getInvoicesForOrganization(organizationId, githubId, token)
      .asCallback(jsonResponseHanlder.bind(null, res, next))
  })

app.get('/billing/payment-method/',
  function (req, res, next) {
    let organizationId = parseInt(keypather.get(req, 'query.organizationId'), 10)
    let githubId = keypather.get(req, 'sessionUser.accounts.github.id')
    let token = keypather.get(req, 'sessionUser.accounts.github.accessToken')
    log.trace({ organizationId: req.query.organizationId, githubId: githubId }, 'payment-method route')
    BillingService.getPaymentMethodForOrganization(organizationId, githubId, token)
      .asCallback(jsonResponseHanlder.bind(null, res, next))
  })

app.post('/billing/payment-method/',
  function (req, res, next) {
    let organizationId = parseInt(keypather.get(req, 'query.organizationId'), 10)
    let githubId = keypather.get(req, 'sessionUser.accounts.github.id')
    let stripeToken = keypather.get(req, 'body.stripeToken')
    let userEmail = keypather.get(req, 'sessionUser.email')
    log.trace({ organizationId: organizationId, githubId: githubId, stripeToken, userEmail }, 'get stripeToken and githubId')
    BillingService.postPaymentMethodForOrganization(organizationId, githubId, stripeToken, userEmail)
      .asCallback(jsonResponseHanlder.bind(null, res, next))
  })

