'use strict';

/**
 * Context Version API
 * @module rest/contexts/versions
 */

var express = require('express');
var app = module.exports = express();

var mw = require('dat-middleware');
var flow = require('middleware-flow');
var checkFound = require('middlewares/check-found');
var Boom = mw.Boom;

var mongoMiddleware = require('middlewares/mongo');
var contexts = mongoMiddleware.contexts;
var contextVersions = mongoMiddleware.contextVersions;
var infraCodeVersions = mongoMiddleware.infraCodeVersions;
var builds = mongoMiddleware.builds;
var me = require('middlewares/me');
var isInternalRequest = require('middlewares/is-internal-request');
var validations = require('middlewares/validations');
var isObjectId = validations.isObjectId;
var isPopulatedArray = validations.isPopulatedArray;
var transformations = require('middlewares/transformations');
var mavis = require('middlewares/apis').mavis;
var docker = require('middlewares/apis').docker;
var error = require('error');

var findContext = flow.series(
  contexts.findById('params.contextId'),
  checkFound('context'),
  flow.or(
    me.isOwnerOf('context'),
    mw.req('context.isSource').validate(validations.equals(true)),
    mw.headers('x-github-event').matches(/^push$/),
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
  mw.req().set('opts', {}),
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
      checkFound('build')),
  mw.body('infraCodeVersion').require()
    .then(
      infraCodeVersions.findById('body.infraCodeVersion'),
      checkFound('infraCodeVersion'),
      mw('infraCodeVersion')('context.toString()')
        .validate(validations.equalsKeypath('params.contextId'))
        .then(
          contextVersions.create({
            context: 'context._id',
            createdBy: {
              github: 'sessionUser.accounts.github.id'
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
  contextVersions.model.getTriggeredByUsername('sessionUser'),
  mw.res.json('contextVersion'));

/** Copies a context version
 *  @param id versionId of the source version
 *  @returns Build
 *  @event GET /builds/
 *  @memberof module:rest/builds */
app.post('/contexts/:contextId/versions/:id/actions/copy',
  findContext,
  contextVersions.findById('params.id'),
  checkFound('contextVersion'),
  // only supports deep copy for now
  mw.query('deep').require().validate(validations.equals('true')),
  contextVersions.createDeepCopy('sessionUser', 'contextVersion'),
  mw.res.status(201),
  mw.res.json('contextVersion'));

app.post('/contexts/:contextId/versions/:id/actions/build',
  isInternalRequest,
  findContext,
  contextVersions.findById('params.id'),
  checkFound('contextVersion'),
  flow.try(
    mavis.create(),
    mavis.model.findDock('container_build', 'contextVersion.dockerHost'),
    mw.req().set('originalContextVersion', 'contextVersion'),
    contextVersions.model.dedupe(),
    // FIXME: handle errors - bc if buildStarted this falls through to catch
    // then it will try to end an unstarted contextVersion
    mw.req('contextVersion.build.started').require()
      .else(
        contextVersions.model.setBuildStarted('sessionUser', 'mavisResult', 'body'),
        docker.create('mavisResult'),
        contextVersions.model.populate('infraCodeVersion'),
        function (req, res, next) {
          var docker = req.docker;
          var sessionUser = req.sessionUser;
          var contextVersion = req.contextVersion;
          docker.createImageBuilderAndAttach(
            sessionUser, contextVersion, function (err, container) {
              if (err) { return next(err); }
              req.container = container;
              next();
            });
        },
        function (req, res, next) {
          res.status(201);
          res.json(req.contextVersion);
          req.hasResponded = true;
          next();
        },
        docker.model.startImageBuilderAndWait('sessionUser', 'contextVersion', 'container'),
        contextVersions.model.setBuildCompleted('dockerResult'))
  ).catch(
    function (err, req, res, next) {
      req.err = err;
      logIfErrAndNext(next)(err);
    },
    function (req, res, next) {
      req.contextVersion.updateBuildError(req.err,
        logIfErrAndNext(next));
    },
    function (req, res, next) {
      if (!req.hasResponded && req.err) {
        next(req.err);
      } else {
        next();
      }
    }
  ),
  mw.res.json(201, 'contextVersion'));

function logIfErrAndNext (next) {
  return function (err) {
    error.logIfErr(err);
    next();
  };
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
  mw.res.send(204));

app.patch('/contexts/:contextId/versions/:id', function (req, res) { res.send(405); });
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
