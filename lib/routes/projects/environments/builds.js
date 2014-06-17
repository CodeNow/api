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


// app.post('/:projectId/environments/:envId/builds',
//   findEnvironment,
//   builds.create
//   );
//

app.get('/:projectId/environments/:envId/builds',
  findEnvironment,
  builds.find({
    project: 'params.projectId',
    environment: 'params.envId'
  }),
  mw.res.json('builds'));

app.get('/:projectId/environments/:envId/builds/:id',
  findEnvironment,
  builds.findOne({
    _id: 'params.id',
    project: 'params.projectId',
    environment: 'params.envId'
  }),
  builds.checkFound,
  mw.res.json('build'));
