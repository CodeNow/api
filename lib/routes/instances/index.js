'use strict';

/**
 * Project API
 * @module rest/instances
 */

var express = require('express');
var app = module.exports = express();
var flow = require('middleware-flow');
var mw = require('dat-middleware');
var Boom = mw.Boom;

var me = require('middlewares/me');
var mongoMiddleware = require('middlewares/mongo');
var projects = mongoMiddleware.projects;
var instances = mongoMiddleware.instances;
var versions = mongoMiddleware.versions;
var validations = require('middlewares/validations');
var docklet = require('middlewares/apis').docklet;
var docker = require('middlewares/apis').docker;
var hipacheHosts = require('middlewares/redis').hipacheHosts;

var findInstance = flow.series(
  instances.findById('params.id'),
  instances.checkFound
);

/**
 * List of instances
 */
app.get('/',
  mw.res.send(501));

/**
 * Post in a instance
 */
app.post('/',
  mw.body('environment').require().validate(validations.isObjectId),
  projects.findOneBy('environments._id', 'body.environment'),
  projects.checkFound,
  mw.req().set('environment', 'project.environments.id(body.environment)'),
  mw.req('environment').require()
    .else(mw.next(Boom.notFound('Environment not found'))),
  mw.req('environment.contexts').require().validate(validations.notEmpty)
    .else(mw.next(Boom.notFound('Environment does not have any contexts'))),
  docklet.create(),
  docklet.model.findDock(),
  docker.create('dockletResult'),
  versions.findByIds('environment.versions'),
  docker.model.createContainersForVersions('versions'),
  instances.create({
    createdBy: 'userId',
    owner:     'project.owner',
    project:   'project._id',
    environment: 'environment._id'
  }),
  instances.model.addContainers('dockletResult', 'dockerResult', 'environment'),
  hipacheHosts.create(),
  hipacheHosts.model.createRoutesForInstance('instance'),
  instances.model.save(),
  // FIXME: delete containers and routes on error
  mw.res.send(201, 'instance'));

/**
 * Get in a instance
 */
app.get('/:id',
  findInstance,
  flow.or(
    me.isOwnerOf('instance'),
    instances.model.isPublic(),
    me.isModerator),
  mw.res.json('instance'));

/**
 * Update in a instance
 */
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

/**
 * Delete in a instance
 */
app.delete('/:id',
  mw.res.send(501));