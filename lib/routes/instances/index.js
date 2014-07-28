'use strict';

/**
 * Project API
 * @module rest/instances
 */

var express = require('express');
var app = module.exports = express();
var flow = require('middleware-flow');
var mw = require('dat-middleware');

var me = require('middlewares/me');
var mongoMiddlewares = require('middlewares/mongo');
var instances = mongoMiddlewares.instances;
var contextVersions = mongoMiddlewares.contextVersions;
var projects = mongoMiddlewares.projects;
var builds = mongoMiddlewares.builds;
var validations = require('middlewares/validations');
var docker = require('middlewares/apis').docker;
var hipacheHosts = require('middlewares/redis').hipacheHosts;
var transformations = require('middlewares/transformations');
var checkFound = require('middlewares/check-found');
var uuid = require('uuid');
var Boom = mw.Boom;

var findInstance = flow.series(
  instances.findById('params.id'),
  checkFound('instance'));

var findBuild = flow.series(
  builds.findById('body.build'),
  checkFound('build'),
  projects.findOneByEnvId('build.environment'),
  checkFound('project'),
  flow.or(
    me.isOwnerOf('project'),
    me.isModerator));

/** List of instances
 *  @event GET rest/instances
 *  @memberof module:rest/instances */
app.get('/',
  mw.query('owner.github')
    .require()
    .mapValues(transformations.toInt)
    .number(),
  me.isOwnerOf('query'),
  instances.find('query'),
  instances.models.populateModels(),
  mw.res.json('instances'));

var createAllContainers = flow.series(
  contextVersions.findByIds('build.contextVersions'),
  mw.req('contextVersions').validate(validations.existsArray('build.completed'))
    .then(mw.next(Boom.badRequest('Cannot create an instance from a unbuilt build'))),
  docker.create(),
  docker.model.createContainersForVersions('contextVersions'),
  hipacheHosts.create(),
  instances.model.addContainers('contextVersions', 'dockerResult', 'build'),
  hipacheHosts.model.createRoutesForInstance('instance'),
  instances.model.save());

var removeAllContainers = flow.series(
  // remove hipache routes
  hipacheHosts.create(),
  hipacheHosts.model.removeRoutesForInstance('instance'),
  // delete containers
  docker.create(),
  docker.model.destroyContainers('instance.containers'),
  // remove instance
  instances.updateById('params.id', {
    $set: { containers: [] }
  }));

/** Post in a instance
 *  // FIXME: @tj - get some params in here
 *  @event POST rest/instances
 *  @memberof module:rest/instances */
app.post('/',
  mw.body('build').require().validate(validations.isObjectId),
  mw.body('name').require().transform(transformations.setDefault(uuid())),
  findBuild,
  mw.req('build.erroredContextVersions').validate(validations.isEmptyArray),
  instances.create({
    createdBy: { github: 'sessionUser.accounts.github.id' },
    build: 'build._id',
    name: 'body.name',
    owner: 'project.owner',
    project: 'build.project',
    environment: 'build.environment'
  }),
  createAllContainers,
  // FIXME: delete containers and routes on error
  mw.res.send(201, 'instance'));

/** Get in a instance
 *  @event GET rest/instances/:id
 *  @memberof module:rest/instances */
app.get('/:id',
  findInstance,
  flow.or(
    me.isOwnerOf('instance'),
    instances.model.isPublic(),
    me.isModerator),
  instances.model.populateModelsAndContainers(),
  mw.res.json('instance'));

/** Update in a instance
 *  @event PATCH rest/instances/:id
 *  @memberof module:rest/instances */
app.patch('/:id',
  findInstance,
  flow.or(
    me.isOwnerOf('instance'),
    me.isModerator),
  mw.body({ or: ['public', 'name']}).require().pick(),
  instances.updateById('params.id', {
    $set: 'body'
  }),
  instances.findById('params.id'),
  mw.body('name').require()
    .then(
      hipacheHosts.create(),
      hipacheHosts.model.createRoutesForInstance('instance')),
  mw.res.json('instance'));

app.post('/:id/actions/restart',
  findInstance,
  flow.or(
    me.isOwnerOf('instance'),
    me.isModerator),
  flow.mwIf(mw.req('instance.containers').validate(validations.isPopulatedArray))
    .then(
      builds.findById('instance.build'),
      removeAllContainers,
      instances.findById('params.id'),
      createAllContainers),
  instances.findById('params.id'),
  mw.res.json('instance'));

/** Delete in a instance
 *  @event DELETE rest/instances/:id
 *  @memberof module:rest/instances */
app.delete('/:id',
  findInstance,
  flow.or(
    me.isOwnerOf('instance'),
    me.isModerator),
  flow.mwIf(mw.req('instance.containers').validate(validations.isPopulatedArray))
    .then(removeAllContainers),
  // remove instance
  instances.removeById('params.id'),
  mw.res.send(204));
