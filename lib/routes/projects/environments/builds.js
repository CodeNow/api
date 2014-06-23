var express = require('express');

var app = module.exports = express();
var mw = require('dat-middleware');
var flow = require('middleware-flow');
var validations = require('middlewares/validations');
var mongoMiddlewares = require('middlewares/mongo');
var projects = mongoMiddlewares.projects;
var builds = mongoMiddlewares.builds;
var me = require('middlewares/me');

var findEnvironment = flow.series(
  mw.params('projectId', 'envId')
    .require().validate(validations.isObjectId),
  projects.findById('params.projectId'),
  projects.checkFound,
  flow.or(
    me.isOwnerOf('project'),
    me.isModerator),
  projects.model.findEnvById('params.envId'));

/** Get list of project environment builds
 *  @param projectId project id
 *  @param envId environment id
 *  @returns [Build, ...]
 *  @event GET /projects/:projectId/environments/:envId/builds
 *  @memberof module:rest/projects/environments */
app.get('/:projectId/environments/:envId/builds',
  findEnvironment,
  builds.findAndPopulate({
    project: 'params.projectId',
    environment: 'params.envId'
  }, 'createdBy'),
  mw.res.json('builds'));

/** Gets a specific project environment build
 *  @param projectId project id
 *  @param envId environment id
 *  @param id build id
 *  @returns Build
 *  @event GET /projects/:projectId/environments/:envId/builds
 *  @memberof module:rest/projects/environments */
app.get('/:projectId/environments/:envId/builds/:id',
  findEnvironment,
  builds.findOne({
    _id: 'params.id',
    project: 'params.projectId',
    environment: 'params.envId'
  }),
  builds.checkFound,
  mw.res.json('build'));
