/**
 * @module lib/routes/isolation/index
 */
'use strict'

var express = require('express')
var app = module.exports = express()

var clone = require('101/clone')
var flow = require('middleware-flow')
var mongooseware = require('mongooseware')
var mw = require('dat-middleware')

var checkFound = require('middlewares/check-found')
var Instance = mongooseware(require('models/mongo/instance'))
var IsolationService = require('models/services/isolation-service')
var me = require('middlewares/me')

app.post('/isolations',
  // IsolationService does a nice job validating the body. Don't worry too much.
  mw.body('master', 'children').pick(),
  // Little bit of validation.
  mw.body('master').require(),
  Instance.findById('body.master'),
  checkFound('instance'),
  flow.or(
    me.isOwnerOf('instance'),
    me.isModerator
  ),
  function (req, res, next) {
    var data = clone(req.body)
    IsolationService.createIsolationAndEmitInstanceUpdates(data, req.sessionUser)
      .asCallback(function (err, newIsolation) {
        req.isolation = newIsolation
        next(err)
      })
  },
  mw.res.json(201, 'isolation'))
