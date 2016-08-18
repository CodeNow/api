/**
 * @module lib/routes/teammateInvitation
 */
'use strict'

var express = require('express')
var mw = require('dat-middleware')

var app = module.exports = express()

var Promise = require('bluebird')

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

