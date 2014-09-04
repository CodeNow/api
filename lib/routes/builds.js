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
var projects = mongoMiddlewares.projects;
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
var findEnvironment = flow.series(
  mw.params('projectId', 'envId')
    .require().validate(validations.isObjectId),
  projects.findById('params.projectId'),
  checkFound('project'),
  flow.or(
    me.isOwnerOf('project'),
    me.isModerator),
  projects.model.findEnvById('params.envId'),
  checkFound('project', 'Environment not found'));

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

/** Get list of project environment builds
 *  @returns [Build, ...]
 *  @event GET /projects/
 *  @memberof module:rest/projects/environments */
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

/** Gets a specific project environment build
 *  @param id build id
 *  @returns Build
 *  @event GET /projects/
 *  @memberof module:rest/projects/environments */

app.get('/:id',
  builds.findOnePopulated('sessionUser', {
    _id: 'params.id'
  }),
  checkFound('build'),
  mw.res.json('build'));


/** Builds a specific project environment build */

app.post('/:id/actions/build',
  builds.findById('params.id'),
  checkFound('build'),
  mw('build')('started').require()
    .then(mw.next(Boom.conflict('Build is already in progress'))),
  mw('build')('completed').require()
    .then(mw.next(Boom.conflict('Build is already built'))),
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
  builds.model.setInProgress('sessionUser'),
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
      // FIXME: handle errors - bc if buildStarted this falls through to catch
      // then it will try to end an unstarted contextVersion
      contextVersions.model.setBuildStarted('sessionUser', 'mavisResult', 'body'),
      docker.create('mavisResult'),
      // builds.model.dedupeContextVersions(),
      contextVersions.model.populate('infraCodeVersion'),
      function (eachReq, res, next) {
        var req = eachReq.req;
        var docker = eachReq.docker;
        var sessionUser = eachReq.sessionUser;
        var contextVersion = eachReq.contextVersion;
        docker.createImageBuilderAndAttach(
          sessionUser, contextVersion, function (err, container, stream) {
            req.attachCount++;
            if (req.attachCount === req.contextVersions.length) {
              req.responseSent = true;
              res.json(201, req.build);
            }
            if (err) { return next(err); }
            eachReq.container = container;
            buildStream.sendBuildStream(contextVersion._id, stream);
            next();
          });
      },
      docker.model.startImageBuilderAndWait('sessionUser', 'contextVersion', 'container'),
      contextVersions.model.setBuildCompleted('dockerResult'),
      finishBuild(),
      noop
    ).catch(
      mw.req().setToErr('err'),
      function (req, res, next) {
        var count = createCount(2, next);
        req.contextVersion.updateBuildError(req.err, logIfErrAndContinue);
        req.build.pushErroredContextVersion(req.contextVersion._id, logIfErrAndContinue);
        function logIfErrAndContinue (err) {
          error.logIfErr(err);
          count.next(); //ignore error, only log it.
        }
      },
      finishBuild(),
      mw.req('responseSent').require()
        .else(mw.next('err'))
    )
  )
);

function finishBuild () {
  return flow.series(
    function (req, res, next) {
      buildStream.endBuildStream(req.contextVersion._id, next);
    },
    builds.model.setCompleted()
  );
}