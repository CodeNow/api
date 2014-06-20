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
var versions = mongoMiddlewares.versions;
var builds = mongoMiddlewares.builds;
var validations = require('middlewares/validations');
var docklet = require('middlewares/apis').docklet;
var docker = require('middlewares/apis').docker;
var hipacheHosts = require('middlewares/redis').hipacheHosts;

var findInstance = flow.series(
  instances.findById('params.id'),
  instances.checkFound
);

var findBuild = flow.series(
  builds.findById('body.build'),
  builds.checkFound,
  flow.or(
    me.isOwnerOf('build'),
    me.isModerator)
);

/** List of instances
 *  @event GET rest/instances
 *  @memberof module:rest/instances */
app.get('/', mw.res.send(501));

/** Post in a instance
 *  // FIXME: @tj - get some params in here
 *  @event POST rest/instances
 *  @memberof module:rest/instances */
app.post('/',
  mw.body('build').require().validate(validations.isObjectId),
  findBuild,
  docklet.create(),
  docklet.model.findDock(),
  docker.create('dockletResult'),
  versions.findByIds('build.versions'),
  docker.model.createContainersForVersions('versions'),
  instances.create({
    createdBy: 'userId',
    build:     'build._id',
    owner:     'build.owner',
    project:   'build.project',
    environment: 'build.environment'
  }),
  instances.model.addContainers('dockletResult', 'dockerResult', 'build'),
  hipacheHosts.create(),
  hipacheHosts.model.createRoutesForInstance('instance'),
  instances.model.save(),
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
  mw.res.json('instance'));

/** Update in a instance
 *  @event PATCH rest/instances/:id
 *  @memberof module:rest/instances */
app.patch('/:id',
  findInstance,
  flow.or(
    me.isOwnerOf('instance'),
    me.isModerator),
  mw.body('public').require().pick(),
  instances.updateById('params.id', {
    $set: 'body'
  }),
  instances.findById('params.id'),
  mw.res.json('instance'));

/** Delete in a instance
 *  @event DELETE rest/instances/:id
 *  @memberof module:rest/instances */
app.delete('/:id', mw.res.send(501));
