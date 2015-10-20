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
'use strict';

var express = require('express');
var app = module.exports = express();

var mw = require('dat-middleware');
var flow = require('middleware-flow');

var checkFound = require('middlewares/check-found');
var ContextService = require('middlewarize')(require('models/services/context-service'));
var isInternalRequest = require('middlewares/is-internal-request');
var logger = require('middlewares/logger')(__filename);
var mavis = require('middlewares/apis').mavis;
var me = require('middlewares/me');
var mongoMiddleware = require('middlewares/mongo');
var ownerIsHelloRunnable = require('middlewares/owner-is-hello-runnable');
var rabbitMQ = require('models/rabbitmq');
var transformations = require('middlewares/transformations');
var validations = require('middlewares/validations');

var Boom = mw.Boom;
var builds = mongoMiddleware.builds;
var contextVersions = mongoMiddleware.contextVersions;
var contexts = mongoMiddleware.contexts;
var infraCodeVersions = mongoMiddleware.infraCodeVersions;
var isObjectId = validations.isObjectId;
var isPopulatedArray = validations.isPopulatedArray;

var findContext = flow.series(
  contexts.findById('params.contextId'),
  checkFound('context'),
  flow.or(
    me.isOwnerOf('context'),
    ownerIsHelloRunnable('context'),
    mw.req('context.isSource').validate(validations.equals(true)),
    me.isModerator));

/** List contextVersions of a {@link module:models/context Context}
 *  @param {ObjectId} contextId ID of the {@link module:models/context Context}
 *  @returns {array.object} List of versions 501
 *  @event GET rest/contexts/:contextId/versions
 *  @memberof module:rest/contexts/versions */
app.get('/contexts/:contextId/versions',
  // FIXME: either add paging or only allow version listing for sourceContexts for now
  findContext,
  // FIXME: get specific values on appCodeVersions
  mw.query('appCodeVersions', 'infraCodeVersion', 'limit', 'sort').pick(),
  mw.query('appCodeVersions').require()
    .then(
      mw.query('appCodeVersions').array().validate(isPopulatedArray),
      mw.query('appCodeVersions').each(
        function (item, req, eachReq, res, next) { eachReq.appCodeVersion = item; next(); },
        mw.req('appCodeVersion.repo').require().string(),
        mw.req('appCodeVersion.branch').require().string(),
        mw.req('appCodeVersion.commit').require().string()
      ),
      function (req, res, next) {
        /* I apologize for having this function, but it makes it beat the crap out of mongo.
         * We need to get the versions that match the app code versions we were given in an
         * array (i.e. [{repo, branch, commit}, {repo, branch, commit}]). This function loops
         * quickly over that list and makes a mongo query so that we match ALL the truples we
         * were given, and (with the $size parameter) not a subset.
         */
        var acvs = {
          $size: 0,
          $all: [
          // for reference, this is what we need to have in $all
          // {
          //   $elemMatch: {
          //     repo: '',
          //     branch: '',
          //     commit: ''
          //   }
          // }
          ]
        };
        req.query.appCodeVersions.forEach(function (acv) {
          acvs.$size += 1;
          acvs.$all.push({
            $elemMatch: {
              lowerRepo: acv.repo.toLowerCase(),
              lowerBranch: acv.branch.toLowerCase(),
              commit: acv.commit
            }
          });
        });
        req.query.appCodeVersions = acvs;
        next();
      }),
  mw.query('infraCodeVersion').require()
    .then(
      mw.query('infraCodeVersion').string()),
  mw.query().set('context', 'params.contextId'),
  // let's add some logic for limit and sort!
  function (req, res, next) {
    // dat-middleware set creates closures when reference values are used! (objects)
    req.opts = {};
    next();
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
  mw.res.json('contextVersions'));

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
};
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
  mw.res.json(201, 'contextVersion'));


  // mw.body('versionId').pick().require(),
  // contextVersions.findById('body.versionId'),
  // checkFound('contextVersion'),
  // contextVersions.createDeepCopy('contextVersion', {
  //   github: 'sessionUser.accounts.github.id'
  // }),
  // contextVersions.model.save(),
  // mw.res.json(201, 'contextVersion'));

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
  mw.res.json('contextVersion'));

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
  mw.body('owner').pick(),
  function (req, res, next) {
    if (!req.body.owner) {
      return next();
    }
    mw.or(
      me.isOwnerOf('body'),
      me.isModerator
    )(req, res, next);
  },
  ContextService.handleVersionDeepCopy(
    'context',
    'contextVersion',
    'sessionUser',
    'body',
    'cb').async('contextVersion'),
  mw.res.status(201),
  mw.res.json('contextVersion'));

/** Builds a context version
 *  used internally (github hook, build build), session user may not be real
 *  @param id versionId of the source version
 *  @returns Build
 *  @event POST /contexts/:contextId/versions/:versionId/actions/build
 *  @memberof module:rest/contexts/versions */
app.post('/contexts/:contextId/versions/:id/actions/build',
  logger(['body'], 'POST_CONTEXTS_ID_VERSIONS_ID_ACTIONS_BUILD', 'info'),
  isInternalRequest,
  findContext,
  contextVersions.findById('params.id'),
  checkFound('contextVersion'),
  // fetch latest commits for all addional repos with `useLatest==true` flag
  contextVersions.model.modifyAppCodeVersionWithLatestCommit('sessionUser'),
  mw.body('message').require()
    .then(
      mw.body('message').string()),
  mw.body({ or: [
    'triggeredAction.rebuild',
    'triggeredAction.appCodeVersion'
  ]}).require()
    .else(
      mw.body().set('triggeredAction.manual', true)),
  mw.body('triggeredAction.appCodeVersion').require()
    .then(
      mw.body(
        'triggeredAction.appCodeVersion.repo',
        'triggeredAction.appCodeVersion.commit'
      ).require()
    ),
  mw.req('contextVersion.build.started').require()
    .then(
      mw.next(Boom.conflict('cannot build a context version that is already building or built'))),
  mw.req().set('origContextVersion', 'contextVersion'),
  // dedupe: overwrites contextVersion on req, only dedupes with in-progress or completed cv
  mw.req('body.noCache').validate(validations.equals(true))
    .else(contextVersions.model.dedupe()),
  mw.req('contextVersion.build.started').require()
    .then( // dupe found
      logger(['contextVersion'], 'ROUTE: contextVersion.build.started', 'trace'),
      function (req, res, next) {
        if (req.contextVersion._id.toString() !==
            req.origContextVersion._id.toString()) {
          req.origContextVersion.remove(next);
        }
        else {
          next();
        }
      },
      mw.res.json(201, 'contextVersion')
    )
    .else( // no dupe found, build NOT started yet
      logger(['contextVersion'], 'ROUTE: NOT contextVersion.build.started', 'trace'),
      mavis.create(),
      mavis.model.findDockForBuild('contextVersion', 'context'),
      mw.req().set('dockerHost', 'mavisResult'),
      contextVersions.model.setBuildStarted('sessionUser', 'mavisResult', 'body'),
      mw.req().set('cachedBuildId', 'contextVersion.build._id'),
      mw.req('body.noCache').validate(validations.equals(true))
        .else(contextVersions.model.dedupeBuild()),
      // check if build deduped by checking if the build id changed
      mw.req('contextVersion.build._id.toString()')
        .validate(validations.notEqualsKeypath('cachedBuildId.toString()'))
        .then(mw.res.json(201, 'contextVersion'))
        .else(
          contextVersions.model.populateOwner('sessionUser'),
          function (req, res, next) {
            rabbitMQ.createImageBuilderContainer({
              manualBuild: req.body.triggeredAction.manual || false,
              sessionUserGithubId: req.sessionUser.accounts.github.id,
              ownerUsername: req.contextVersion.owner.username,
              contextId: req.context._id.toString(),
              contextVersionId: req.contextVersion._id.toString(),
              dockerHost: req.dockerHost,
              noCache: req.body.noCache || false,
              tid: req.domain.runnableData.tid
            });
            next();
          },
          // create and start was successful, respond cv
          mw.req().set('json', 'contextVersion.toJSON()'),
          mw.res.json(201, 'json')
        )
    )
  );

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
  mw.res.send(204));

/**
 * patch update context version
 * @param body.advanced
 */
app.patch('/contexts/:contextId/versions/:id',
  findContext,
  contextVersions.findById('params.id'),
  checkFound('contextVersion'),
  mw.body('advanced').require().boolean().pick(),
  contextVersions.model.modifySelf({
    $set: 'body'
  }),
  mw.res.send('contextVersion')
);

app.delete('/contexts/:contextId/versions/:id', function (req, res) { res.send(405); });

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
    var InfraCodeVersion = require('models/mongo/infra-code-version');
    InfraCodeVersion.findById(req.query.sourceInfraCodeVersion,
      function (err, infraCodeVersion) {
        if (err) {
          next(err);
        }
        else if (!infraCodeVersion) {
          next(Boom.notFound('Source not found (files)'));
        }
        else {
          next();
        }
      });
  },
  infraCodeVersions.findById('contextVersion.infraCodeVersion'),
  checkFound('infraCodeVersion'),
  infraCodeVersions.model.removeSourceDir(),
  infraCodeVersions.model.copyFilesFromSource('query.sourceInfraCodeVersion'),
  infraCodeVersions.updateById('contextVersion.infraCodeVersion', { $set: {
    parent: 'query.sourceInfraCodeVersion'
  }}),
  mw.res.json(200, 'infraCodeVersion._id'));
