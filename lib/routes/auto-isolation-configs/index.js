'use strict'

/** @module lib/routes/auto-isolation-config/index */

var express = require('express')
var app = module.exports = express()
var keypather = require('keypather')()

var Boom = require('dat-middleware').Boom
var flow = require('middleware-flow')
var isString = require('101/is-string')
var me = require('middlewares/me')
var mw = require('dat-middleware')
var Promise = require('bluebird')

var AutoIsolationConfig = require('models/mongo/auto-isolation-config')
var Instance = require('models/mongo/instance')

var checkFound = require('middlewares/check-found')

app.get('/auto-isolation-configs',
  mw.query('instance').pick().require(),
  function (req, res, next) {
    Instance.findOneByShortHashAsync(keypather.get(req, 'query.instance'))
    .tap(function (instance) {
      req.instance = instance
    })
    .asCallback(next)
  },
  checkFound('instance'),
  flow.or(
    me.isOwnerOf('instance'),
    me.isModerator),
  function (req, res, next) {
    AutoIsolationConfig.findAsync({ instance: req.query.instance })
      .then(function (aigs) {
        res.json(aigs)
      })
      .catch(next)
  })

app.get('/auto-isolation-configs/:id',
  function (req, res, next) {
    AutoIsolationConfig.findOneAsync({ _id: req.params.id })
      .then(function (aic) {
        if (!aic) { throw Boom.notFound('Auto Isolation Config not found.') }
        res.json(aic)
      })
      .catch(next)
  })

app.delete('/auto-isolation-configs/:id',
  mw.params('id').require(),
  function (req, res, next) {
    AutoIsolationConfig.findOneAsync({ _id: req.params.id })
      .then(function (aic) {
        if (!aic) { throw Boom.notFound('Auto Isolation Config not found.') }
        return AutoIsolationConfig.findOneAndRemoveAsync({ _id: req.params.id })
      })
      .then(function () {
        res.status(204)
        res.end()
      })
      .catch(next)
  })

app.post('/auto-isolation-configs',
  mw.body('instance', 'requestedDependencies').pick(),
  mw.body('requestedDependencies').require().array(),
  mw.body('instance').require().string(),
  function (req, res, next) {
    var err = null
    req.body.requestedDependencies = req.body.requestedDependencies.map(function (d) {
      if (err) { return }
      if (d.instance) {
        if (!isString(d.instance)) {
          err = Boom.badRequest('instance must be a string')
        }
        if (d.repo || d.branch || d.org) {
          err = Boom.badRequest('repo, branch, and org cannot be defined with instance')
        }
        return { instance: d.instance.toLowerCase() }
      } else {
        if (!isString(d.repo) || !isString(d.branch) || !isString(d.org)) {
          err = Boom.badRequest('repo, branch, and org must be defined for each dependency')
        }
        return {
          repo: d.repo.toLowerCase(),
          branch: d.branch.toLowerCase(),
          org: d.org.toLowerCase()
        }
      }
    })
    next(err)
  },
  function (req, res, next) {
    Instance.findOneAsync({ _id: req.body.instance })
      .then(function (instance) {
        if (!instance) { throw Boom.notFound('Instance not found.') }
        var aic = new AutoIsolationConfig(req.body)
        return Promise.fromCallback(aic.save.bind(aic))
      })
      .then(function (aic) {
        res.status(201)
        res.json(aic)
      })
      .catch(next)
  })
