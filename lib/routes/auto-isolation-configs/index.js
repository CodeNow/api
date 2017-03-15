'use strict'

/** @module lib/routes/auto-isolation-config/index */

const express = require('express')
const app = module.exports = express()
const keypather = require('keypather')()

const Boom = require('dat-middleware').Boom
const flow = require('middleware-flow')
const me = require('middlewares/me')
const mw = require('dat-middleware')

const AutoIsolationConfig = require('models/mongo/auto-isolation-config')
const AutoIsolationService = require('models/services/auto-isolation-service')
const Instance = require('models/mongo/instance')

const checkFound = require('middlewares/check-found')

app.get('/auto-isolation-configs',
  mw.query('instance').pick().require(),
  function (req, res, next) {
    Instance.findOneByShortHashAsync(keypather.get(req, 'query.instance'))
    .tap(function (instance) {
      req.instance = instance
    })
    .asCallback(function (err) {
      next(err)
    })
  },
  checkFound('instance'),
  flow.or(
    me.isOwnerOf('instance'),
    me.isModerator),
  function (req, res, next) {
    AutoIsolationConfig.findAllActive({ instance: req.query.instance })
      .then(function (aigs) {
        res.json(aigs)
      })
      .catch(next)
  })

app.get('/auto-isolation-configs/:id',
  function (req, res, next) {
    return AutoIsolationConfig.findByIdAndAssert(req.params.id)
    .then((aic) => {
      return res.json(aic)
    })
    .catch(next)
  })

app.delete('/auto-isolation-configs/:id',
  mw.params('id').require(),
  function (req, res, next) {
    AutoIsolationConfig.markAsDeleted(req.params.id)
    .then((aic) => {
      if (!aic) { throw Boom.notFound('Auto Isolation Config not found.') }
      res.status(204)
      res.end()
    })
    .catch(next)
  })

// AutoIsolation.create will also attempt to update if the given instance already
// has one
app.post('/auto-isolation-configs',
  mw.body('instance', 'requestedDependencies', 'redeployOnKilled').pick(),
  mw.body('requestedDependencies').require().array(),
  mw.body('instance').require().string(),
  function (req, res, next) {
    return AutoIsolationService.create(
      req.sessionUser,
      req.body.instance,
      req.body.requestedDependencies,
      req.body.redeployOnKilled || false
    )
      .then(function (aic) {
        res.status(201)
        res.json(aic)
      })
      .catch(next)
  })
