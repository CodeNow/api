'use strict';

var express = require('express');

var debug = require('debug')('runnable-api:build');
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
var hasProps = require('101/has-properties');
var Boom = mw.Boom;
var async = require('async');
var Mavis = require('models/apis/mavis');
var buildStream = require('socket/build-stream.js');
var error = require('error');
var Docker = require('models/apis/docker');
var createCount = require('callback-count');

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
  findBuild,
  mw.res.json('build'));

app.post('/:id/actions/copy',
  findBuild,
  builds.model.createCopy({
    createdBy: { github: 'sessionUser.accounts.github.id' },
    owner: { github: 'sessionUser.accounts.github.id' }
  }),
  checkFound('build'),
  mw.res.status(201),
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
  buildVersionsAndTailLogs // FIXME: middlewarize
);

function buildVersionsAndTailLogs (req, res) {
  var noop = function () {};
  // Since we know that the req objects can change behind the curtains when this is called multiple
  // times asyncly, let's cache everything
  var build = req.build;
  var buildProps = req.body;
  var contextVersions = req.contextVersions;
  var sessionUser = req.sessionUser;
  debug('Starting Build: ', build._id);
  var respondCounter = createCount(contextVersions.length, function () {
    // this error is already logged, always return 201
    debug('Responding to client with: ', build._id);
    res.json(201, build);
  });
  async.forEach(contextVersions, function (contextVersion, cb) {
    async.waterfall([
      findDock,
      versionSetBuildStarted,
      buildVersion
    ], function (err, dockerInfo) {
      debug('FINISHING Build: ', build._id);
      if (err) {
        error.logIfErr(err);
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
      contextVersion.setBuildStarted(sessionUser, dockerHost, buildProps,
        function (err, updatedContextVersion) {
          updatedContextVersion.dockerHost = dockerHost;
          contextVersion = updatedContextVersion;
          cb(err, dockerHost);
        });
    }
    function buildVersion (dockerHost, cb) {
      var docker = new Docker(dockerHost);
      docker.buildVersion(contextVersion, sessionUser, respondCounter.next, cb);
    }
  }, function () {
    debug('Setting build complete', build._id);
    build.setCompleted(noop);
  });
}



