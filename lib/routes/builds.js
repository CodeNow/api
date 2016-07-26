/**
 * POST /builds
 * GET /builds
 * GET /builds/:id
 * POST /builds/:id/actions/copy
 * POST /builds/:id/actions/build
 * @module lib/routes/builds
 */
'use strict'

var express = require('express')
var mw = require('dat-middleware')
var pluck = require('101/pluck')
var keypather = require('keypather')()

var mongoMiddlewares = require('middlewares/mongo')

var transformations = require('middlewares/transformations')
var validations = require('middlewares/validations')

var builds = mongoMiddlewares.builds
var Boom = mw.Boom
var Build = require('models/mongo/build')
var BuildService = require('models/services/build-service')
var Context = require('models/mongo/context')
var ContextVersion = require('models/mongo/context-version')

var app = module.exports = express()

/** Create a build
 *  @param {Object} body.owner build owner
 *  @param [String] body.contextVersions array with one context version id.
 *  @returns [Build, ...]
 *  @event POST /builds/
 *  @memberof module:rest/builds */
app.post('/builds/',
  function (req, res, next) {
    BuildService.createBuild(req.body, req.sessionUser)
      .tap(function (build) {
        res.status(201).json(build.toJSON())
      })
      .catch(function (err) {
        // Handle errors like this or you hit issues between domains and promises
        next(err)
      })
  }
)

/** Get list of builds
 *  @returns [Builds...]
 *  @event GET /builds/
 *  @memberof module:rest/builds */
app.get('/builds/',
  mw.query('completed', 'started', 'buildNumber', 'owner', 'contextVersions',
    'sort', 'limit').pick(),
  mw.query('contextVersions').require()
    .then(mw.query('contextVersions').mapValues(transformations.arrayToInQuery)),
  mw.query('owner').require()
    .else(mw.query().set('owner.github', 'sessionUser.accounts.github.id')),
  mw.query('started').require()
    .then(mw.query('started').mapValues(transformations.boolToExistsQuery)),
  mw.query('completed').require()
    .then(mw.query('completed').mapValues(transformations.boolToExistsQuery)),
  function (req, res, next) {
    // dat-middleware set creates closures when reference values are used! (objects)
    req.opts = {}
    next()
  },
  mw.query('limit').require()
    .then(
      mw.query('limit').mapValues(transformations.toInt),
      mw.query('limit').number(),
      mw.req().set('opts.limit', 'query.limit'),
      mw.query().unset('limit')),
  mw.query('sort').require()
    .then(
      mw.req().set('opts.sort', 'query.sort'),
      mw.query().unset('sort'),
      mw.req('opts.sort').validate(validations.equalsAny(
        'buildNumber', 'duration', 'started', 'created',
        '-buildNumber', '-duration', '-started', '-created'))
  ),
  function (req, res, next) {
    Build.findAsync(req.query, null, req.opts)
    .tap(function (builds) {
      req.builds = builds
    })
    .asCallback(function (err) {
      next(err)
    })
  },
  mw.res.json('builds'))

/** Gets a specific build by id
 *  @param id buildId of the build to return
 *  @returns Build
 *  @event GET /builds/:id
 *  @memberof module:rest/builds */
app.get('/builds/:id',
  function (req, res, next) {
    BuildService.findBuildAndAssertAccess(req.params.id, req.sessionUser)
    .tap(function (build) {
      res.json(build.toJSON())
    })
    .catch(function (err) {
      next(err)
    })
  })

/** Copies a build
 *  @param id buildId of the source build
 *  @returns Build
 *  @event GET /builds/
 *  @memberof module:rest/builds */
app.post('/builds/:id/actions/copy',
  function (req, res, next) {
    BuildService.findBuildAndAssertAccess(req.params.id, req.sessionUser)
    .tap(function (build) {
      req.build = build
    })
    .asCallback(function (err) {
      next(err)
    })
  },
  mw.query('deep').require()
    .then(
      // deep copy
      function (req, res, next) {
        var runnable = new Runnable({}, req.sessionUser)
        runnable.deepCopyContextVersions(
          keypather.get(req, 'build.contexts'),
          keypather.get(req, 'build.contextVersions'),
          function (err, result) {
            if (err) {
              return next(err)
            }
            req.copiedContextVersions = result
            next()
          })
      },
      function (req, res, next) {
        req.copiedContextVersions =
          req.copiedContextVersions.map(pluck('json()'))
        var copiedVersions = req.copiedContextVersions
        req.contextIds = copiedVersions.map(pluck('context'))
        req.contextVersionIds = copiedVersions.map(pluck('_id'))
        next()
      },
      function (req, res, next) {
        var build = new Build({
          createdBy: {
            github: keypather.get(req, 'sessionUser.accounts.github.id')
          },
          contexts: keypather.get(req, 'contextIds'),
          contextVersions: keypather.get(req, 'contextVersionIds'),
          owner: keypather.get(req, 'build.owner')
        })
        build.saveAsync()
        .tap(function (build) {
          req.build = build
        })
        .asCallback(function (err) {
          next(err)
        })
      })
    .else(
      // shallow copy
      function (req, res, next) {
        req.build.shallowCopyAsync({
          createdBy: {
            github: keypather.get(req, 'sessionUser.accounts.github.id')
          }
        })
        .tap(function (build) {
          req.build = build
        })
        .asCallback(function (err) {
          next(err)
        })
      }),
  mw.res.status(201),
  mw.res.json('build'))

/** Build a build
 *  @param id buildId of the build to build
 *  @returns Build
 *  @event GET /builds/
 *  @memberof module:rest/builds */
app.post('/builds/:id/actions/build',
  function (req, res, next) {
    BuildService.buildBuild(req.params.id, req.body, req.sessionUser, req.domain)
    .tap(function (build) {
      req.build = build
    })
    .asCallback(function (err) {
      next(err)
    })
  },
  mw.res.status(201),
  mw.res.json('build')
)
