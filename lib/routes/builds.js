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
var flow = require('middleware-flow')
var mw = require('dat-middleware')
var pluck = require('101/pluck')

var checkFound = require('middlewares/check-found')
var error = require('error')
var me = require('middlewares/me')
var ownerIsHelloRunnable = require('middlewares/owner-is-hello-runnable')
var runnable = require('middlewares/apis').runnable
var transformations = require('middlewares/transformations')
var validations = require('middlewares/validations')

var Boom = mw.Boom
var builds = require('mongooseware')(require('models/mongo/build'))
var contexts = require('mongooseware')(require('models/mongo/context'))
var contextVersions = require('mongooseware')(require('models/mongo/context-version'))
var ContextVersion = require('models/mongo/context-version')

var app = module.exports = express()

var findBuild = flow.series(
  mw.params('id').require().validate(validations.isObjectId),
  builds.findById('params.id'),
  checkFound('build'),
  flow.or(
    me.isOwnerOf('build'),
    ownerIsHelloRunnable('build'),
    me.isModerator))

/** Create a build
 *  @param {Object} body.owner build owner
 *  @param [String] body.contextVersions array with one context version id.
 *  @returns [Build, ...]
 *  @event POST /builds/
 *  @memberof module:rest/builds */
app.post('/builds/',
  mw.body('owner').require()
    .then(
      mw.req('isInternalRequest').require() // skip owner check if internal
        .else(
          mw.body('owner').validate(validations.isObject),
          mw.body('owner.github').require().number(),
          me.isOwnerOf('body')))
    .else( // if not provided set it to sessionUser
      mw.body().set('owner.github', 'sessionUser.accounts.github.id')),
  mw.body('contextVersions').require().validate(validations.isObjectIdArray)
    .then(
      contextVersions.findByIds('body.contextVersions'),
      mw.body('contextVersions.length')
        .validate(validations.equalsKeypath('contextVersions.length'))
        .else(mw.next(Boom.notFound('Some contextVersions not found'))),
      contexts.findByVersions('contextVersions'),
      mw.req('contexts').each(
        function (context, req, eachReq, res, next) {
          eachReq.context = context
          next()
        },
        mw.req('body.owner.github')
          .validate(validations.equalsKeypath('context.owner.github'))
          .else(mw.next(Boom.badRequest("Context version's owner must match build owner")))),
      function (req, res, next) {
        req.contextIds = req.contextVersions.map(pluck('context'))
        req.contextVersionIds = req.contextVersions.map(pluck('_id'))
        next()
      }
  ),
  builds.create({
    createdBy: {
      github: 'sessionUser.accounts.github.id'
    },
    owner: {
      github: 'body.owner.github'
    }
  }),
  mw.req('contextVersionIds.length').require().validate(validations.notEquals(0))
    .then(
      builds.model.set({
        contexts: 'contextIds',
        contextVersions: 'contextVersionIds'
      })),
  builds.model.save(),
  mw.res.json(201, 'build')
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
  builds.find('query', null, 'opts'),
  mw.res.json('builds'))

/** Gets a specific build by id
 *  @param id buildId of the build to return
 *  @returns Build
 *  @event GET /builds/:id
 *  @memberof module:rest/builds */
app.get('/builds/:id',
  findBuild,
  mw.res.json('build'))

/** Copies a build
 *  @param id buildId of the source build
 *  @returns Build
 *  @event GET /builds/
 *  @memberof module:rest/builds */
app.post('/builds/:id/actions/copy',
  findBuild,
  checkFound('build'),
  mw.query('deep').require()
    .then(
      // deep copy
      runnable.create({}, 'sessionUser'),
      runnable.model.deepCopyContextVersions(
        'build.contexts', 'build.contextVersions'),
      mw.req().set('pluck', pluck),
      mw.req().set('copiedContextVersions', 'runnableResult'),
      function (req, res, next) {
        req.copiedContextVersions =
          req.copiedContextVersions.map(pluck('json()'))
        var copiedVersions = req.copiedContextVersions
        req.contextIds = copiedVersions.map(pluck('context'))
        req.contextVersionIds = copiedVersions.map(pluck('_id'))
        next()
      },
      builds.create({
        createdBy: {
          github: 'sessionUser.accounts.github.id'
        },
        contexts: 'contextIds',
        contextVersions: 'contextVersionIds',
        owner: 'build.owner'
      }),
      builds.model.save())
    .else(
      // shallow copy
      builds.model.shallowCopy({
        createdBy: {
          github: 'sessionUser.accounts.github.id'
        }
      })),
  mw.res.status(201),
  mw.res.json('build'))

var validateContextVersions = function (req, res, next) {
  if (req.contextVersions.length === 0) {
    return next(Boom.badRequest('Cannot build a build without context versions'))
  }
  if (req.contextVersions.length > 1) { // this should not be possible.
    return next(Boom.badRequest('Cannot build a build with many context versions'))
  }
  next()
}

/** Build a build
 *  @param id buildId of the build to build
 *  @returns Build
 *  @event GET /builds/
 *  @memberof module:rest/builds */
app.post('/builds/:id/actions/build',
  builds.findById('params.id'),
  checkFound('build'),
  mw('build')('completed').require()
    .then(mw.next(Boom.conflict('Build is already built'))),
  mw('build')('started').require()
    .then(mw.next(Boom.conflict('Build is already in progress'))),
  mw.body('message').require().then(mw.body('message').string()),
  mw.body({
    or: [
      'triggeredAction.rebuild',
      'triggeredAction.appCodeVersion'
    ]
  }).require()
    .else(mw.body().set('triggeredAction.manual', true)),
  mw.body('triggeredAction.appCodeVersion').require()
    .then(
      mw.body(
        'triggeredAction.appCodeVersion.repo',
        'triggeredAction.appCodeVersion.commit'
      ).require()
  ),
  contextVersions.findByIds('build.contextVersions', {'build.log': false}),
  validateContextVersions,
  mw.req().set('contextVersion', 'contextVersions[0]'),
  builds.model.setInProgress('sessionUser'), // must be set before dedupe
  // builds can have an already built contextVersion
  mw.req('contextVersion.build.started').require()
    .else( // build has an unbuilt contextVersion
      mw.req().set('origContextVersion', 'contextVersion'),
      function (req, res, next) {
        ContextVersion.buildSelf(
          req.contextVersion,
          req.sessionUser,
          req.body,
          req.domain
        )
          .then(function (contextVersion) {
            req.contextVersion = contextVersion
            return req.build.replaceContextVersionAsync(req.origContextVersion, contextVersion)
          })
          .catch(function (err) {
            error.log(err, req)
            return req.build.modifyErroredAsync(req.contextVersion._id)
              .catch(function (err) {
                error.log(err, req)
              })
            // fall through to send build and listen for the build completed event
          })
          .asCallback(next)
      }
  ),
  builds.model.modifyCompletedIfFinished('contextVersion.build'),
  builds.findById('params.id'),
  mw.res.status(201),
  mw.res.json('build')
)
