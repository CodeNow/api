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
var keypather = require('keypather')()

var mw = require('dat-middleware')
var flow = require('middleware-flow')

var assign = require('101/assign')
var runnable = require('middlewares/apis').runnable
var transformations = require('middlewares/transformations')
var validations = require('middlewares/validations')

var Boom = mw.Boom
var BuildService = require('models/services/build-service')
var ContextService = require('models/services/context-service')
var ContextVersion = require('models/mongo/context-version')
var ContextVersionService = require('models/services/context-version-service')
var InfraCodeVersion = require('models/mongo/infra-code-version')
var Instance = require('models/mongo/instance')
var PermissionService = require('models/services/permission-service')
var InfraCodeVersionService = require('models/services/infracode-version-service')
var isObjectId = validations.isObjectId

var findContext = function (req, res, next) {
  ContextService.findContext(req.params.contextId)
  .tap(function (context) {
    req.context = context
  })
  .tap(function (context) {
    return PermissionService.ensureModelAccess(req.sessionUser, context)
  })
  .asCallback(function (err) {
    next(err)
  })
}

var findContextVersion = function (req, res, next) {
  ContextVersionService.findContextVersion(req.params.id)
  .tap(function (contextVersion) {
    req.contextVersion = contextVersion
  })
  .asCallback(function (err) {
    next(err)
  })
}

var findInfraCodeVersion = function (idKeypath) {
  return function (req, res, next) {
    var id = keypather.get(req, idKeypath)
    InfraCodeVersionService.findInfraCodeVersion(id)
    .tap(function (infraCodeVersion) {
      req.infraCodeVersion = infraCodeVersion
    })
    .asCallback(function (err) {
      next(err)
    })
  }
}

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
      var appCodeVersionQuery = ContextVersion
        .generateQueryForAppCodeVersions(req.query.appCodeVersions)
      assign(req.query, { appCodeVersions: appCodeVersionQuery })
      next()
    })
    .else(
      mw.query('repo', 'branch').require()
        .then(function (req, res, next) {
          var repoBranchQuery = ContextVersion
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
  function (req, res, next) {
    ContextVersion.findAsync(req.query, null, req.opts)
    .tap(function (contextVersions) {
      req.contextVersions = contextVersions
    })
    .asCallback(next)
  },
  mw.res.json('contextVersions'))

/** Create a new version of a {@link module:models/context Context}
 *  @param {ObjectId} contextId ID of the {@link module:models/context Context}
 *  @returns {object} {@link module:models/version Version}
 *  @event POST rest/contexts/:contextId/versions
 *  @memberof module:rest/contexts/versions */
app.post('/contexts/:contextId/versions',
  findContext,
  mw.query('toBuild').require()
    .then(
      mw.query('toBuild').validate(isObjectId),
      function (req, res, next) {
        BuildService.findBuild(req.query.toBuild)
        .tap(function (build) {
          req.build = build
        })
        .asCallback(function (err) {
          next(err)
        })
      },
      mw.req('build.owner.github')
        .validate(validations.equalsKeypath('context.owner.github'))
        .else(mw.next(Boom.badRequest('Build owner (toBuild) must match context owner')))),
  mw.body('infraCodeVersion').require()
    .then(
      mw.body('infraCodeVersion').validate(isObjectId),
      findInfraCodeVersion('body.infraCodeVersion'),
      mw('infraCodeVersion')('context.toString()')
        .validate(validations.equalsKeypath('params.contextId'))
        .then(
          function (req, res, next) {
            var cv = new ContextVersion({
              context: keypather.get(req, 'context._id'),
              createdBy: {
                github: keypather.get(req, 'sessionUser.accounts.github.id')
              },
              owner: {
                github: keypather.get(req, 'context.owner.github')
              }
            })
            // assume infra is from a built contextVersion:
            // which means it cannot be edited and must be copied
            InfraCodeVersion.createCopyByIdAsync(keypather.get(req, 'body.infraCodeVersion'))
            .then(function (icv) {
              cv.set({ 'infraCodeVersion': icv._id })
              cv.saveAsync()
              .tap(function (cv) {
                req.contextVersion = cv
              })
              .asCallback(function (err) {
                next(err)
              })
            })
          }
      )
        .else(
          mw.next(Boom.badRequest('infraCodeVersion must be from same context')))
  )
    .else(
      function (req, res, next) {
        ContextVersion.createWithNewInfraCodeAsync({
          context: keypather.get(req, 'context._id'),
          createdBy: {
            github: keypather.get(req, 'sessionUser.accounts.github.id')
          },
          owner: {
            github: keypather.get(req, 'context.owner.github')
          }
        })
        .tap(function (contextVersion) {
          req.contextVersion = contextVersion
        })
        .asCallback(next)
      }
  ),
  mw.query('toBuild').require()
    .then(
      function (req, res, next) {
        var pushContextAndVersion = {
          $push: {
            contexts: keypather.get(req, 'contextVersion.context'),
            contextVersions: keypather.get(req, 'contextVersion._id')
          }
        }
        req.build.updateAsync(pushContextAndVersion)
        .asCallback(function (err) {
          next(err)
        })
      }),
  mw.res.json(201, 'contextVersion'))

/** Get info on a version of a {@link module:models/context Context}
 *  @param {ObjectId} contextId ID of the {@link module:models/context Context}
 *  @param {ObjectId} id ID of the {@link module:models/version Version}
 *  @returns {object} Info on the version
 *  @event GET rest/contexts/:contextId/versions/:id
 *  @memberof module:rest/contexts/versions */
app.get('/contexts/:contextId/versions/:id',
  findContext,
  findContextVersion,
  mw.res.json('contextVersion'))

/** Copies a context version
 *  @param id versionId of the source version
 *  @returns Build
 *  @event POST /contexts/:contextId/versions/:versionId/actions/copy
 *  @memberof module:rest/contexts/versions */
app.post('/contexts/:contextId/versions/:id/actions/copy',
  findContext,
  findContextVersion,
  // only supports deep copy for now
  mw.query('deep').require().validate(validations.equals('true')),

  mw.req('context.owner.github').require()
    .validate(validations.equals(process.env.HELLO_RUNNABLE_GITHUB_ID))
    .validate(validations.notEqualsKeypath('sessionUser.accounts.github.id'))
    .then(
      // if the build owner is hello-runnable and user is not hello-runnable
      deepCopyCvFromHelloRunnable('contextVersion')
  ).else(
    function (req, res, next) {
      ContextVersion.createDeepCopyAsync(req.sessionUser, req.contextVersion)
      .tap(function (contextVersion) {
        req.contextVersion = contextVersion
      })
      .asCallback(next)
    }
  ),
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
      function (req, res, next) {
        ContextVersion.findByIdAsync(keypather.get(req, 'newContextVersion._id'))
        .tap(function (contextVersion) {
          req.contextVersion = contextVersion
        })
        .asCallback(next)
      }
  )
}

/**
 * We're assuming this is only called when reverting files back to source
 */
app.post('/contexts/:contextId/versions/:id/actions/discardFileChanges',
  findContext,
  findContextVersion,
  mw('contextVersion')('infraCodeVersion').require(),
  findInfraCodeVersion('contextVersion.infraCodeVersion'),
  mw('infraCodeVersion')('parent').require()
    .then(
      function (req, res, next) {
        req.infraCodeVersion.copyFilesFromSourceAsync(keypather.get(req, 'infraCodeVersion.parent'))
        .asCallback(function (err) {
          next(err)
        })
      }),
  mw.res.send(204))

/**
 * patch update context version
 * @param body.advanced
 */
app.patch('/contexts/:contextId/versions/:id',
  findContext,
  findContextVersion,

  mw.body({
    or: [ 'advanced', 'buildDockerfilePath' ]
  }).require().pick(),
  mw.body('advanced').require()
    .then(mw.body('advanced').boolean()),
  mw.body('buildDockerfilePath').require()
    .then(mw.body('buildDockerfilePath').string()),
  function (req, res, next) {
    req.contextVersion.modifySelfAsync({
      $set: req.body
    })
    .tap(function (contextVersion) {
      req.contextVersion = contextVersion
    })
    .then(function () {
      return Instance.updateContextVersionAsync(req.params.id, req.body)
    })
    .asCallback(next)
  },
  mw.res.send('contextVersion')
)

app.delete('/contexts/:contextId/versions/:id', function (req, res) { res.send(405) })

app.put('/contexts/:contextId/versions/:id/infraCodeVersion/actions/copy',
  mw.params('contextId', 'id').validate(isObjectId),
  findContext,
  findContextVersion,
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
  findInfraCodeVersion('contextVersion.infraCodeVersion'),
  function (req, res, next) {
    req.infraCodeVersion.removeSourceDirAsync()
    .then(function (updatedICV) {
      updatedICV.copyFilesFromSourceAsync(keypather.get(req, 'query.sourceInfraCodeVersion'))
      .then(function () {
        InfraCodeVersion.updateByIdAsync(keypather.get(req, 'contextVersion.infraCodeVersion'), {
          $set: {
            parent: keypather.get(req, 'query.sourceInfraCodeVersion')
          }
        })
        .tap(function (infraCodeVersion) {
          req.infraCodeVersion = infraCodeVersion
        })
        .asCallback(function (err) {
          next(err)
        })
      })
    })
  },
  mw.res.json(200, 'infraCodeVersion._id'))
