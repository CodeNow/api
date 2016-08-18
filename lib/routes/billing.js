/**
 * @module lib/routes/teammateInvitation
 */
'use strict'

var express = require('express')
var mw = require('dat-middleware')
var Promise = require('bluebird')

var app = module.exports = express()

var me = require('middlewares/me')
var flow = require('middleware-flow')
var or = flow.or

app.get('/billing',
  flow.mwIf(or(me.isUser, me.isModerator))
  )

app.get('/billing/:organizationId/plan',
  function (req, res, next) {
    Promise.resolve()
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
    Promise.resolve()
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
    Promise.resolve()
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
  function (req, res, next) {
    Promise.resolve()
    .tap(function (body) {
      req.creamResponse = body
    })
    .asCallback(function (err) {
      next(err)
    })
  },
  mw.res.json('creamResponse'))

