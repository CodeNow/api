'use strict'

/**
 * Instance API
 * @module rest/instances
 */

var express = require('express')
var app = module.exports = express()
var keypather = require('keypather')()
var flow = require('middleware-flow')
var mw = require('dat-middleware')
var me = require('middlewares/me')

var Instance = require('models/mongo/instance')
var checkFound = require('middlewares/check-found')

var findInstance = flow.series(
  function (req, res, next) {
    Instance.findOneByShortHashAsync(keypather.get(req, 'params.id'))
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
  // putting the instance._id on req so we don't lose it (and have to search by hash again)
  mw.req().set('instanceId', 'instance._id'))

/** Get's the the containers for an instance (no docker info)
 *  (currently used to determine whether an instance is deployed)
 * instances owned by the owner, as well as those owned by groups (s)he is part of
 *  @event GET rest/instances/:id/containers
 *  @memberof module:rest/instances/:id/containers */
app.get('/instances/:id/containers',
  findInstance,
  mw.res.json('instance.containers'))
