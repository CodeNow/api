'use strict';

var express = require('express');
var async = require('async');
var app = module.exports = express();
var mw = require('dat-middleware');
var flow = require('middleware-flow');
var validations = require('middlewares/validations');
var transformations = require('middlewares/transformations');
var mongoMiddlewares = require('middlewares/mongo');
var projects = mongoMiddlewares.projects;
var builds = mongoMiddlewares.builds;
var contextVersions = mongoMiddlewares.contextVersions;
var me = require('middlewares/me');
var checkFound = require('middlewares/check-found');
var not = require('101/not');
var hasProps = require('101/has-properties');
var Boom = mw.Boom;
var redis = require('models/redis');

var findEnvironment = flow.series(
  mw.params('projectId', 'envId')
    .require().validate(validations.isObjectId),
  projects.findById('params.projectId'),
  checkFound('project'),
  flow.or(
    me.isOwnerOf('project'),
    me.isModerator),
  projects.model.findEnvById('params.envId'));

// app.post('/:projectId/environments/:envId/builds',
//   findEnvironment,
//   mw.body('contextVersions').require().validate(validations.isObjectIdArray),
//   contextVersions.findByIds('contextVersions'),
//   function (req, res, next) {
//     if (req.contextVersions.length !== req.body.contextVersions.length) {
//       next(Boom.badRequest('All ContextVersions not found'));
//     }
//     else {
//       next();
//     }
//   },
//   );

/** Get list of project environment builds
 *  @param projectId project id
 *  @param envId environment id
 *  @returns [Build, ...]
 *  @event GET /projects/:projectId/environments/:envId/builds
 *  @memberof module:rest/projects/environments */
app.get('/:projectId/environments/:envId/builds',
  findEnvironment,
  mw.query('completed').pick(),
  mw.query().set('project', 'params.projectId'),
  mw.query().set('environment', 'params.envId'),
  mw.query('completed').require()
    .then(mw.query('completed').transform(transformations.boolToExistsQuery)),
  builds.find('query'),
  mw.res.json('builds'));

/** Gets a specific project environment build
 *  @param projectId project id
 *  @param envId environment id
 *  @param id build id
 *  @returns Build
 *  @event GET /projects/:projectId/environments/:envId/builds
 *  @memberof module:rest/projects/environments */

var Docklet = require('models/apis/docklet');
var Docker = require('models/apis/docker');
app.get('/:projectId/environments/:envId/builds/:id',
  findEnvironment,
  builds.findOne({
    _id: 'params.id',
    project: 'params.projectId',
    environment: 'params.envId'
  }),
  checkFound('build'),
  mw.res.json('build'));

app.post('/:projectId/environments/:envId/builds/:id/actions/build',
  findEnvironment,
  builds.findOne({
    _id: 'params.id',
    project: 'params.projectId',
    environment: 'params.envId'
  }),
  checkFound('build'),
  mw('build')('started').require()
    .then(mw.next(Boom.badRequest('Build is already in progress'))),
  mw('build')('completed').require()
    .then(mw.next(Boom.badRequest('Build is already built'))),
  contextVersions.findByIds('build.contextVersions'),
  function (req, res, next) {
    req.contextVersions = req.contextVersions.filter(not(hasProps('build')));
    if (req.contextVersions.length === 0) {
      return next(Boom.badRequest('All versions are built'));
    }
    next();
  },
  builds.model.setInProgress(),
  function (req, res, next) {
    res.json(201, req.build);
    next();
  },
  buildVersionsAndTailLogs
);


function buildVersionsAndTailLogs (req) {
  async.forEach(req.contextVersions, function (contextVersion) {
    // FIXME: multi-container note - waterfall would force builds to run in series..
    // optimally each version build can be run in parallel
    async.waterfall([
      findDockerHost,
      versionSetBuildStarted,
      buildVersion,
      versionSetBuildCompleted
    ], function (err) {
      if (err) {
        var noop = function () {};
        console.error(err.message);
        console.error(err.stack);
        contextVersion.updateBuildError(err, noop);
        req.build.updateErroredContextVersion(contextVersion._id, noop);
      }
      // done.. do nothing
      // pubsub 'til for primus for proper testing
      redis.publish(req.build._id+':build_completed', 'finito');
    });

    // waterfall functions:
    function findDockerHost (cb) {
      if (contextVersion.dockerHost) {
        cb(null, contextVersion.dockerHost);
      }
      else {
        var docklet = new Docklet();
        docklet.findDock(cb);
      }
    }
    function versionSetBuildStarted (dockerHost, cb) {
      contextVersion.update({
        $set: {
          dockerHost: dockerHost,
          build: {
            message: req.body.message || 'Manual Build',
            triggeredBy: {
              user: req.sessionUser._id
            },
            started: Date.now()
          }
        }
      }, function (err) {
        cb(err, dockerHost); // pass-thru dockerHost
      });
    }
    function buildVersion (dockerHost, cb) {
      var docker = new Docker(dockerHost);
      // attach primus here, refactor buildVersion
      docker.buildVersion(contextVersion, cb);
    }
    function versionSetBuildCompleted (dockerInfo, cb) {
      contextVersion.update({
        $set: {
          'build.dockerTag'  : dockerInfo.dockerTag,
          'build.dockerImage': dockerInfo.dockerImage,
          'build.completed'  : Date.now()
        }
      }, function (err) { cb(err); });
    }
  }, function () {});
}