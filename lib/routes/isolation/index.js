/**
 * @module lib/routes/isolation/index
 */
'use strict'

var express = require('express')
var app = module.exports = express()

var clone = require('101/clone')
var mw = require('dat-middleware')

var IsolationService = require('models/services/isolation-service')

app.post('/isolations',
  // TODO(bryan): add permissions check
  // TODO(bryan): add validation of body
  function (req, res, next) {
    var data = clone(req.body)
    data.sessionUser = req.sessionUser
    IsolationService.createIsolationAndEmitInstanceUpdates(data).asCallback(function (err, newIsolation) {
      req.isolation = newIsolation
      next(err)
    })
  },
  mw.json('isolation'))
