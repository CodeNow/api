/**
 * Context Version API
 * GET /contexts/:contextId/versions
 * POST /contexts/:contextId/versions
 * GET /contexts/:contextId/versions/:id
 * POST /contexts/:contextId/versions/:id/actions/copy
 * POST /contexts/:contextId/versions/:id/actions/build
 * POST /contexts/:contextId/versions/:id/actions/discardFileChanges
 * PATCH /contexts/:contextId/versions/:id
 * DELETE /contexts/:contextId/versions/:id
 * PUT /contexts/:contextId/versions/:versionId/infraCodeVersion/actions/copy
 * @module rest/contexts/versions
 */
'use strict'

var express = require('express')
var app = module.exports = express()
var uuid = require('uuid')

var mw = require('dat-middleware')
var flow = require('middleware-flow')

var assign = require('101/assign')
var checkFound = require('middlewares/check-found')
var me = require('middlewares/me')
var mongoMiddleware = require('middlewares/mongo')
var ownerIsHelloRunnable = require('middlewares/owner-is-hello-runnable')
var runnable = require('middlewares/apis').runnable
var transformations = require('middlewares/transformations')
var validations = require('middlewares/validations')

var Boom = mw.Boom
var builds = mongoMiddleware.builds
var ContextService = require('models/services/context-service')
var contextVersion = require('models/mongo/context-version')
var contextVersions = mongoMiddleware.contextVersions
var contexts = mongoMiddleware.contexts
var infraCodeVersions = mongoMiddleware.infraCodeVersions
var instances = mongoMiddleware.instances
var isObjectId = validations.isObjectId

var findContext = flow.series(
  contexts.findById('params.contextId'),
  checkFound('context'),
  flow.or(
    me.isOwnerOf('context'),
    ownerIsHelloRunnable('context'),
    mw.req('context.isSource').validate(validations.equals(true)),
    me.isModerator))

/** List contextVersions of a {@link module:models/context Context}
 *  @param {ObjectId} contextId ID of the {@link module:models/context Context}
 *  @returns {array.object} List of versions 501
 *  @event GET rest/contexts/:contextId/versions
 *  @memberof module:rest/contexts/versions */
app.get('/contexts/:contextId/versions',
  // FIXME: either add paging or only allow version listing for sourceContexts for now
  findContext,
  // FIXME: get specific values on appCodeVersions
  mw.query('appCodeVersions', 'branch', 'repo', 'infraCodeVersion', 'build', 'limit', 'sort').pick(),
  mw.query('infraCodeVersion').require()
    .then(
      mw.query('infraCodeVersion').string()),
  mw.query('build').require()
    .then(
      function (req, res, next) {
        assign(req.query, transformations.dotFlattenObject(req.query, 'build'))
        next()
      },
      mw.query('["build.completed"]').require()
        .then(mw.query('["build.completed"]').mapValues(transformations.boolToExistsQuery)),
      mw.query('["build.started"]').require()
        .then(mw.query('["build.started"]').mapValues(transformations.boolToExistsQuery)),
      mw.query('["build.triggeredAction.manual"]').require()
        .then(mw.query('["build.triggeredAction.manual"]').mapValues(transformations.toBool)),
      mw.query().unset('build')
    ),
  mw.query().set('context', 'params.contextId'),
  mw.query('appCodeVersions').require()
    .then(function (req, res, next) {
      var appCodeVersionQuery = contextVersion
        .generateQueryForAppCodeVersions(req.query.appCodeVersions)
      assign(req.query, { appCodeVersions: appCodeVersionQuery })
      next()
    })
    .else(
      mw.query('repo', 'branch').require()
        .then(function (req, res, next) {
          var repoBranchQuery = contextVersion
            .generateQueryForBranchAndRepo(req.query.repo, req.query.branch)
          assign(req.query, repoBranchQuery)
          next()
        }),
        mw.query().unset('repo'),
        mw.query().unset('branch')
    ),
  // let's add some logic for limit and sort!
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
      mw.query('sort').validate(validations.equalsAny(
        'started', '-started', 'created', '-created')),
      mw.req().set('opts.sort', 'query.sort'),
      mw.query().unset('sort')),
  contextVersions.find('query', null, 'opts'),
  checkFound('contextVersions'),
  mw.res.json('contextVersions'))

/** Create a new version of a {@link module:models/context Context}
 *  @param {ObjectId} contextId ID of the {@link module:models/context Context}
 *  @returns {object} {@link module:models/version Version}
 *  @event POST rest/contexts/:contextId/versions
 *  @memberof module:rest/contexts/versions */
var pushContextAndVersion = {
  $push: {
    contexts: 'contextVersion.context',
    contextVersions: 'contextVersion._id'
  }
}
app.post('/contexts/:contextId/versions',
  findContext,
  mw.query('toBuild').require()
    .then(
      mw.query('toBuild').validate(isObjectId),
      builds.findById('query.toBuild'),
      checkFound('build'),
      mw.req('build.owner.github')
        .validate(validations.equalsKeypath('context.owner.github'))
        .else(mw.next(Boom.badRequest('Build owner (toBuild) must match context owner')))),
  mw.body('infraCodeVersion').require()
    .then(
      mw.body('infraCodeVersion').validate(isObjectId),
      infraCodeVersions.findById('body.infraCodeVersion'),
      checkFound('infraCodeVersion'),
      mw('infraCodeVersion')('context.toString()')
        .validate(validations.equalsKeypath('params.contextId'))
        .then(
          contextVersions.create({
            context: 'context._id',
            createdBy: {
              github: 'sessionUser.accounts.github.id'
            },
            owner: {
              github: 'context.owner.github'
            }
          }),
          // assume infra is from a built contextVersion:
          // which means it cannot be edited and must be copied
          infraCodeVersions.createCopyById('body.infraCodeVersion'),
          contextVersions.model.set({'infraCodeVersion': 'infraCodeVersion._id'}),
          contextVersions.model.save()
      )
        .else(
          mw.next(Boom.badRequest('infraCodeVersion must be from same context')))
  )
    .else(
      contextVersions.createWithNewInfraCode({
        context: 'context._id',
        createdBy: {
          github: 'sessionUser.accounts.github.id'
        },
        owner: {
          github: 'context.owner.github'
        }
      })
  ),
  mw.query('toBuild').require()
    .then(
      builds.model.update(pushContextAndVersion)
  ),
  mw.res.json(201, 'contextVersion'))

// mw.body('versionId').pick().require(),
  // contextVersions.findById('body.versionId'),
  // checkFound('contextVersion'),
  // contextVersions.createDeepCopy('contextVersion', {
  //   github: 'sessionUser.accounts.github.id'
  // }),
  // contextVersions.model.save(),
  // mw.res.json(201, 'contextVersion'))

/** Get info on a version of a {@link module:models/context Context}
 *  @param {ObjectId} contextId ID of the {@link module:models/context Context}
 *  @param {ObjectId} id ID of the {@link module:models/version Version}
 *  @returns {object} Info on the version
 *  @event GET rest/contexts/:contextId/versions/:id
 *  @memberof module:rest/contexts/versions */
app.get('/contexts/:contextId/versions/:id',
  findContext,
  contextVersions.findById('params.id'),
  checkFound('contextVersion'),
  mw.res.json('contextVersion'))

/** Copies a context version
 *  @param id versionId of the source version
 *  @returns Build
 *  @event POST /contexts/:contextId/versions/:versionId/actions/copy
 *  @memberof module:rest/contexts/versions */
app.post('/contexts/:contextId/versions/:id/actions/copy',
  findContext,
  contextVersions.findById('params.id'),
  checkFound('contextVersion'),
  // only supports deep copy for now
  mw.query('deep').require().validate(validations.equals('true')),

  mw.req('context.owner.github').require()
    .validate(validations.equals(process.env.HELLO_RUNNABLE_GITHUB_ID))
    .validate(validations.notEqualsKeypath('sessionUser.accounts.github.id'))
    .then(
      // if the build owner is hello-runnable and user is not hello-runnable
      deepCopyCvFromHelloRunnable('contextVersion')
  ).else(
    contextVersions.createDeepCopy('sessionUser', 'contextVersion')),
  mw.res.status(201),
  mw.res.json('contextVersion'))

function deepCopyCvFromHelloRunnable (cvKey) {
  return flow.series(
    // maybe error if the contextVersion has acvs?
    // make a new context
    mw.req('contextVersion', cvKey),
    // create context requires name
    function (req, res, next) {
      req.body.name = uuid()
      ContextService.createNew(req.sessionUser, req.body)
      .then(function (context) {
        req.newContext = context
        next()
      })
      .catch(next)
    },
    // make a new context-version
    runnable.create({}, 'sessionUser'),
    runnable.model.createContextVersion('newContext._id'),
    mw.req().set('newContextVersion', 'runnableResult'),
    // use infracodeversion copy route to copy the files
    runnable.create({}, 'sessionUser'),
    runnable.model.copyVersionIcvFiles(
      'newContext._id',
      'newContextVersion._id',
      'contextVersion.infraCodeVersion'),
    contextVersions.findById('newContextVersion._id')
  )
}

/**
 * We're assuming this is only called when reverting files back to source
 */
app.post('/contexts/:contextId/versions/:id/actions/discardFileChanges',
  findContext,
  contextVersions.findById('params.id'),
  checkFound('contextVersion'),
  mw('contextVersion')('infraCodeVersion').require(),
  infraCodeVersions.findById('contextVersion.infraCodeVersion'),
  checkFound('infraCodeVersion'),
  mw('infraCodeVersion')('parent').require()
    .then(infraCodeVersions.model.copyFilesFromSource('infraCodeVersion.parent')),
  // .else(
  //   infraCodeVersions.model.setAndSave({ files: [] })),
  mw.res.send(204))

/**
 * patch update context version
 * @param body.advanced
 */
app.patch('/contexts/:contextId/versions/:id',
  findContext,
  contextVersions.findById('params.id'),
  checkFound('contextVersion'),

  mw.body({
    or: [ 'advanced', 'buildDockerfilePath' ]
  }).require().pick(),
  mw.body('advanced').require()
    .then(mw.body('advanced').boolean()),
  mw.body('buildDockerfilePath').require()
    .then(mw.body('buildDockerfilePath').string()),
  contextVersions.model.modifySelf({
    $set: 'body'
  }),
  instances.updateContextVersion('params.id', 'body'),
  mw.res.send('contextVersion')
)

app.delete('/contexts/:contextId/versions/:id', function (req, res) { res.send(405) })

app.put('/contexts/:contextId/versions/:versionId/infraCodeVersion/actions/copy',
  mw.params('contextId', 'versionId').validate(isObjectId),
  findContext,
  contextVersions.findById('params.versionId'),
  checkFound('contextVersion'),
  mw('contextVersion')('build.completed').require()
    .then(mw.next(Boom.badRequest('Cannot modify a built version.'))),
  mw('contextVersion')('build.started').require()
    .then(mw.next(Boom.badRequest('Cannot modify an in progress version.'))),
  mw.query('sourceInfraCodeVersion').require().validate(isObjectId),
  function (req, res, next) {
    var InfraCodeVersion = require('models/mongo/infra-code-version')
    InfraCodeVersion.findById(req.query.sourceInfraCodeVersion,
      function (err, infraCodeVersion) {
        if (err) {
          next(err)
        } else if (!infraCodeVersion) {
          next(Boom.notFound('Source not found (files)'))
        } else {
          next()
        }
      })
  },
  infraCodeVersions.findById('contextVersion.infraCodeVersion'),
  checkFound('infraCodeVersion'),
  infraCodeVersions.model.removeSourceDir(),
  infraCodeVersions.model.copyFilesFromSource('query.sourceInfraCodeVersion'),
  infraCodeVersions.updateById('contextVersion.infraCodeVersion', {
    $set: {
      parent: 'query.sourceInfraCodeVersion'
    }
  }),
  mw.res.json(200, 'infraCodeVersion._id'))
