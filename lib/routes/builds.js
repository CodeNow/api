'use strict';

var express = require('express');

// var debug = require('debug')('runnable-api:build');
var app = module.exports = express();
var mw = require('dat-middleware');
var flow = require('middleware-flow');
var validations = require('middlewares/validations');
var transformations = require('middlewares/transformations');
// var apiMiddlewares = require('middlewares/apis');
var mongoMiddlewares = require('middlewares/mongo');
var builds = mongoMiddlewares.builds;
var contextVersions = mongoMiddlewares.contextVersions;
var me = require('middlewares/me');
var checkFound = require('middlewares/check-found');
var not = require('101/not');
var noop = require('101/noop');
var hasProps = require('101/has-properties');
var Boom = mw.Boom;
var mavis = require('middlewares/apis').mavis;
var docker = require('middlewares/apis').docker;
var buildStream = require('socket/build-stream.js');
var error = require('error');
var createCount = require('callback-count');
var runnable = require('middlewares/apis').runnable;
var pluck = require('101/pluck');

var findEnvironment = flow.series(
  mw.log('SHOULD NOT BE FINDING ENVIRONMENT IN BUILD'),
  mw.res.send(500));

var findBuild = flow.series(
  mw.params('id').require().validate(validations.isObjectId),
  builds.findById('params.id'),
  checkFound('build'),
  flow.or(
    me.isOwnerOf('build'),
    me.isModerator));

/** Create a build
 *  @returns [Build, ...]
 *  @event POST /builds/
 *  @memberof module:rest/builds */
app.post('/',
  mw.body('owner.github').require()
    .then(
      mw.req('isInternalRequest').require() // skip owner check if internal
        .else(me.isOwnerOf('body')))
    .else( // if not provided set it to sessionUser
      mw.body().set('owner.github', 'sessionUser.accounts.github.id')),
  builds.create({
    createdBy: {
      github: 'sessionUser.accounts.github.id'
    },
    owner: {
      github: 'body.owner.github'
    }
  }),
  builds.model.save(),
  mw.res.json(201, 'build')
);

/** Get list of builds
 *  @returns [Builds...]
 *  @event GET /builds/
 *  @memberof module:rest/builds */
app.get('/',
  findEnvironment,
  mw.query('completed', 'started', 'buildNumber', 'environment', 'sort').pick(),
  mw.query().set('environment', 'params.envId'),
  mw.query('started').require()
    .then(mw.query('started').mapValues(transformations.boolToExistsQuery)),
  mw.query('completed').require()
    .then(mw.query('completed').mapValues(transformations.boolToExistsQuery)),
  mw.req().set('opts', {}),
  mw.query('sort').require()
    .then(
      mw.req().set('opts.sort', 'query.sort'),
      mw.query().unset('sort'),
      mw.req('opts.sort').validate(validations.equalsAny(
        'buildNumber', 'duration', 'started',
        '-buildNumber', '-duration', '-started'))
    ),
  builds.findPopulated('sessionUser', 'query', null, 'opts'),
  mw.res.json('builds'));

/** Gets a specific build by id
 *  @param id buildId of the build to return
 *  @returns Build
 *  @event GET /builds/:id
 *  @memberof module:rest/builds */
app.get('/:id',
  findBuild,
  mw.res.json('build'));

/** Copies a build
 *  @param id buildId of the source build
 *  @returns Build
 *  @event GET /builds/
 *  @memberof module:rest/builds */
app.post('/:id/actions/copy',
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
          req.copiedContextVersions.map(pluck('json()'));
        var copiedVersions = req.copiedContextVersions;
        req.contextIds        = copiedVersions.map(pluck('context'));
        req.contextVersionIds = copiedVersions.map(pluck('_id'));
        next();
      },
      builds.model.shallowCopy({
        createdBy: {
          github: 'sessionUser.accounts.github.id'
        },
        contexts: 'contextIds',
        contextVersions: 'contextVersionIds'
      }))
    .else(
      // shallow copy
      builds.model.shallowCopy({
        createdBy: {
          github: 'sessionUser.accounts.github.id'
        }
      })),
  mw.res.status(201),
  mw.res.json('build'));

/** Build a build
 *  @param id buildId of the build to build (say that ten times fast)
 *  @returns Build
 *  @event GET /builds/
 *  @memberof module:rest/builds */
app.post('/:id/actions/build',
  builds.findById('params.id'),
  checkFound('build'),
  mw('build')('completed').require()
    .then(mw.next(Boom.conflict('Build is already built'))),
  mw('build')('started').require()
    .then(mw.next(Boom.conflict('Build is already in progress'))),
  mw.body('message').require(),
  mw.body({ or: [
    'triggeredAction.rebuild',
    'triggeredAction.appCodeVersion'
  ]}).require()
    .else(mw.body().set('triggeredAction.manual', true)),
  mw.body('triggeredAction.appCodeVersion').require()
    .then(
      mw.body(
        'triggeredAction.appCodeVersion.repo',
        'triggeredAction.appCodeVersion.commit'
      ).require()
    ),
  contextVersions.findByIds('build.contextVersions'),
  function (req, res, next) {
    if (req.contextVersions.length === 0) {
      return next(Boom.badRequest('Cannot build a build without context versions'));
    }
    req.contextVersions = req.contextVersions.filter(not(hasProps('build')));
    if (req.contextVersions.length === 0) {
      return next(Boom.conflict('All versions are built (build soon to be marked built)'));
    }
    next();
  },
  builds.model.setInProgress('sessionUser'), // must be set before dedupe
  mw.req().set('attachCount', 0),
  mw.req('contextVersions').each(
    function (contextVersion, req, eachReq, res, next) {
      eachReq.req = req;
      eachReq.contextVersion = contextVersion;
      next();
    },
    flow.try(
      mavis.create(),
      mavis.model.findDock('container_build', 'contextVersion.dockerHost'),
      mw.req().set('originalContextVersion', 'contextVersion'),
      contextVersions.model.dedupe(),
      builds.model.replaceContextVersion('originalContextVersion', 'contextVersion'),
      // FIXME: handle errors - bc if buildStarted this falls through to catch
      // then it will try to end an unstarted contextVersion
      mw.req('contextVersion.started').require()
        .then(checkToRespond)
        .else(
          contextVersions.model.setBuildStarted('sessionUser', 'mavisResult', 'body'),
          docker.create('mavisResult'),
          contextVersions.model.populate('infraCodeVersion'),
          function (eachReq, res, next) {
            var docker = eachReq.docker;
            var sessionUser = eachReq.sessionUser;
            var contextVersion = eachReq.contextVersion;
            docker.createImageBuilderAndAttach(
              sessionUser, contextVersion, function (err, container, stream) {
                if (err) { return next(err); }
                eachReq.container = container;
                buildStream.sendBuildStream(contextVersion._id, stream);
                next();
              });
          },
          checkToRespond,
          docker.model.startImageBuilderAndWait('sessionUser', 'contextVersion', 'container'),
          contextVersions.model.setBuildCompleted('dockerResult'),
          function (eachReq, res, next) {
            buildStream.endBuildStream(eachReq.contextVersion._id, next);
          })
    ).catch(
      function (err, eachReq, res, next) {
        eachReq.err = err;
        logIfErrAndNext(next)(err);
      },
      function (eachReq, res, next) {
        var count = createCount(2, next);
        eachReq.contextVersion.updateBuildError(eachReq.err,
          logIfErrAndNext(count.next.bind(count)));
        eachReq.build.pushErroredContextVersion(eachReq.contextVersion._id,
          logIfErrAndNext(count.next.bind(count)));
      },
      checkToRespond,
      function (eachReq, res, next) {
        buildStream.endBuildStream(eachReq.contextVersion._id, logIfErrAndNext(next));
      }
    ),
    builds.model.setCompleted(),
    noop
  )
);

function logIfErrAndNext (next) {
  return function (err) {
    error.logIfErr(err);
    next();
  };
}

function checkToRespond (eachReq, res, next) {
  if (eachReq.counted) { return next(); }
  eachReq.counted = true;
  var req = eachReq.req;
  req.attachCount++;
  if (req.attachCount === req.contextVersions.length) {
    req.responseSent = true;
    res.json(201, req.build);
  }
  next();
}
