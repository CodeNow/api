'use strict';

var express = require('express');

var app = module.exports = express();
var mw = require('dat-middleware');
var flow = require('middleware-flow');
var validations = require('middlewares/validations');
var transformations = require('middlewares/transformations');
var apiMiddlewares = require('middlewares/apis');
var runnable = apiMiddlewares.runnable;
var mongoMiddlewares = require('middlewares/mongo');
var projects = mongoMiddlewares.projects;
var builds = mongoMiddlewares.builds;
var contextVersions = mongoMiddlewares.contextVersions;
var me = require('middlewares/me');
var checkFound = require('middlewares/check-found');
var not = require('101/not');
var hasProps = require('101/has-properties');
var Boom = mw.Boom;
var async = require('async');
var pluck = require('101/pluck');
var Mavis = require('models/apis/mavis');
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

/**
 * This function helps create a build from another build.
 */
var createBuildWithVersionsCopies = flow.series(
  mw('build')('contextVersions').require().validate(validations.isObjectIdArray),
  contextVersions.findByIds('build.contextVersions'),
  mw.body('shallow').require()
    .then(
      projects.findById('build.project'),
      flow.or(
        me.isOwnerOf('project'),
        me.isModerator),
      mw.body('contextVersionsToUpdate').require()
        .then(contextVersions.createShallowCopies(
          'sessionUser',
          'contextVersions',
          'body.contextVersionsToUpdate'))
        .else(contextVersions.createShallowCopies(
          'sessionUser',
          'contextVersions'))
    )
    .else(contextVersions.createDeepCopies('sessionUser', 'contextVersions')),
  function (req, res, next) {
    req.contextIds = req.contextVersions.map(pluck('context'));
    req.contextVersionIds = req.contextVersions.map(pluck('_id'));
    next();
  },
  builds.model.createCopy({
    project: 'params.projectId',
    environment: 'params.envId',
    contexts: 'contextIds',
    contextVersions: 'contextVersionIds',
    createdBy: {
      github: 'sessionUser.accounts.github.id'
    }
  }),
  mw.res.json(201, 'build')
);
var createFromParent = flow.series(
  builds.findById('body.parentBuild'),
  checkFound('build'),
  mw('build')('started').require()
    .else(mw.next(Boom.badRequest('Build cannot be copied because it hasn\'t been started yet'))),
  createBuildWithVersionsCopies
);
var createFirstBuildForEnv = flow.series(
  projects.findOneByEnvId('params.envId'),
  checkFound('project', 'Environment not found'),
  flow.or(
    me.isOwnerOf('project'),
    me.isModerator),
  builds.find({ environment: 'params.envId'}),
  mw('builds')('length').validate(validations.notEquals(0))
    .then(mw.next(Boom.badRequest(
      'Environment specified already has builds, please specify a parentBuild to fork from'))),
  builds.create({
    project: 'params.projectId',
    environment: 'params.envId',
    createdBy: {
      github: 'sessionUser.accounts.github.id'
    }
  }),
  builds.model.save(),
  mw.res.json(201, 'build')
);

app.post('/:projectId/environments/:envId/builds',
  mw.body('parentBuild').require()
    .then(createFromParent)
    .else(createFirstBuildForEnv)
);

/** Get list of project environment builds
 *  @param projectId project id
 *  @param envId environment id
 *  @returns [Build, ...]
 *  @event GET /projects/:projectId/environments/:envId/builds
 *  @memberof module:rest/projects/environments */
app.get('/:projectId/environments/:envId/builds',
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
 *  @param projectId project id
 *  @param envId environment id
 *  @param id build id
 *  @returns Build
 *  @event GET /projects/:projectId/environments/:envId/builds
 *  @memberof module:rest/projects/environments */

var Docker = require('models/apis/docker');
app.get('/:projectId/environments/:envId/builds/:id',
  findEnvironment,
  builds.findOnePopulated('sessionUser', {
    _id: 'params.id',
    environment: 'params.envId'
  }),
  checkFound('build'),
  mw.res.json('build'));


/** Builds a specific project environment build */

app.post('/:projectId/environments/:envId/builds/:id/actions/build',
  findEnvironment,
  builds.findOne({
    _id: 'params.id',
    environment: 'params.envId'
  }),
  checkFound('build'),
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
  mw.body('message').require(),
  mw('build')('started').require()
    .then(mw.next(Boom.conflict('Build is already in progress'))),
  mw('build')('completed').require()
    .then(mw.next(Boom.conflict('Build is already built'))),
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
  mw.body('environment').require() // FIXME: this is yucky but required by product.
    .then(
      projects.model.findEnvById('body.environment'),
      checkFound('project', 'Environment (body.environment) not found'),
      builds.model.update({
        $set: {
          environment: 'body.environment'
        }
      }),
      builds.findById('params.id'),
      function (req, res, next) {
        async.map(req.contextVersions, function (contextVersion, cb) {
          var $set = {
            environment: req.body.environment
          };
          contextVersion.update({ $set: $set }, cb);
        }, next);
      },
      contextVersions.findByIds('build.contextVersions')
    ),
  builds.model.setInProgress('sessionUser'),
  buildVersionsAndTailLogs // FIXME: middlewarize
);

/**
 * This POST request is used for rebuiling a specific build.  Using the body.id as a Build
 * ObjectId, we should find the build, check that it's already been built before, and if everything
 * is good, then we'll start the process. ContextVersion children of this build object will be
 * copied, but their build data will not.  This will create a brand new (unbuilt) Build object with
 * unbuilt contextVersion objects.
 *  @param projectId project id
 *  @param envId environment id
 *  @returns Build
 *  @event POST /projects/:projectId/environments/:envId/builds/:id/actions/rebuild
 */
app.post('/:projectId/environments/:envId/builds/:id/actions/rebuild',
  findEnvironment,
  builds.findOne({
    _id: 'params.id',
    environment: 'params.envId'
  }),
  checkFound('build'),
  mw('build')('started').require()
    .else(mw.next(Boom.badRequest('Build cannot be rebuilt because it hasn\'t been built yet'))),
  runnable.create({}, 'sessionUser'),
  runnable.model.shallowCopyBuild('build'),
  function (req, res, next) {
    req.buildMessage = 'Rebuild #'+req.build.buildNumber;
    next();
  },
  runnable.model.buildBuild('runnableResult', { message: 'buildMessage',
    triggeredAction: { rebuild: true } }),
  mw.res.json(201, 'runnableResult')
);

function buildVersionsAndTailLogs (req, res) {
  var noop = function () {};
  var build = req.build;
  var respondCounter = createCount(req.contextVersions.length, function () {
    // this error is already logged, always return 201
    res.json(201, req.build);

  });
  async.forEach(req.contextVersions, function (contextVersion, cb) {
    async.waterfall([
      findDock,
      versionSetBuildStarted,
      buildVersion
    ], function (err, dockerInfo) {
      if (err) {
        async.parallel([
          contextVersion.updateBuildError.bind(contextVersion, err),
          build.pushErroredContextVersion.bind(build, contextVersion._id)
        ], function(err2) {
          error.logIfErr(err2);
          if (! respondCounter.results.length) {
            respondCounter.next(err);
          }
          buildStream.endBuildStream(contextVersion._id, cb);
        });
      } else {
        contextVersion.setBuildCompleted(dockerInfo, function(err) {
          error.logIfErr(err);
          buildStream.endBuildStream(contextVersion._id, cb);
        });
      }
    });

    // waterfall functions:
    function findDock (cb) {
      var mavis = new Mavis();
      mavis.findDock('container_build', contextVersion.dockerHost, cb);
    }
    function versionSetBuildStarted (dockerHost, cb) {
      var buildProps = req.body;
      contextVersion.setBuildStarted(req.sessionUser, dockerHost, buildProps,
        function (err, updatedContextVersion) {
          updatedContextVersion.dockerHost = dockerHost;
          contextVersion = updatedContextVersion;
          cb(err, dockerHost);
        });
    }
    function buildVersion (dockerHost, cb) {
      var docker = new Docker(dockerHost);
      docker.buildVersion(contextVersion, req.sessionUser, respondCounter.next, cb);
    }
  }, function () {
    build.setCompleted(noop);
  });
}



