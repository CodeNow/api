'use strict';

/**
 * Project API
 * @module rest/instances
 */

var express = require('express');
var app = module.exports = express();
var flow = require('middleware-flow');
var mw = require('dat-middleware');
var async = require('async');

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
var Docker = require('models/apis/docker');
var Instance = require('models/mongo/instance');
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
  instances.models.getGithubUsername(),
  instances.models.populateModels(),
  mw.res.json('instances'));

var createAllContainers = flow.series(
  contextVersions.findByIds('build.contextVersions'),
  mw.req('contextVersions').validate(validations.existsArray('build.completed'))
    .then(mw.next(Boom.badRequest('Cannot create an instance from a unbuilt build'))),
  docker.createContainersForVersions('contextVersions'),
  hipacheHosts.create(),
  instances.model.addContainers('sessionUser', 'contextVersions', 'dockerResult', 'build'),
  hipacheHosts.model.createRoutesForInstance('instance'),
  instances.model.save());

/** Post in a instance
 *  // FIXME: @tj - get some params in here
 *  @event POST rest/instances
 *  @memberof module:rest/instances */
app.post('/',
  mw.body('build').require().validate(validations.isObjectId),
  findBuild,
  mw.req('build.failed').validate(validations.equals(true))
    .then(mw.next(Boom.badRequest('Cannot create instance from failed build'))),
  instances.create({
    createdBy: { github: 'sessionUser.accounts.github.id' },
    build: 'build._id',
    name: 'body.name',
    owner: 'project.owner',
    project: 'build.project',
    environment: 'build.environment'
  }),
  mw.body('name').require()
    .else(
      instances.model.set({name:'instance._id'})
    ),
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
  instances.model.getGithubUsername(),
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
  mw.body('name').require()
    .then(
      hipacheHosts.create(),
      hipacheHosts.model.removeRoutesForInstance('instance')),
  instances.updateById('params.id', {
    $set: 'body'
  }),
  instances.findById('params.id'),
  mw.body('name').require()
    .then(
      hipacheHosts.create(),
      hipacheHosts.model.createRoutesForInstance('instance')),
  mw.res.json('instance'));


/** Start instance containers
 *  @event PUT rest/instances/:id
 *  @memberof module:rest/instances */
app.put('/:id/actions/start',
  findInstance,
  flow.or(
    me.isOwnerOf('instance'),
    me.isModerator),
  flow.mwIf(mw.req('instance.containers').validate(validations.isPopulatedArray))
    .then(
      function (req, res, next) {
        async.forEach(req.instance.containers, function (container, cb) {
          var docker = new Docker(container.dockerHost);
          async.series([
            docker.startContainer.bind(docker,
              container),
            Instance.updateStartedBy.bind(Instance,
              container._id, req.sessionUser)
          ], cb);
        }, next);
      },
      instances.findById('params.id'),
      instances.model.updateInspectedContainerData(),
      instances.findById('params.id'),
      hipacheHosts.create(),
      hipacheHosts.model.createRoutesForInstance('instance'))
    .else(mw.next(Boom.badRequest('Instance does not have any containers'))),
  mw.res.json('instance'));


/** Stop instance containers
 *  @event PUT rest/instances/:id
 *  @memberof module:rest/instances */
app.put('/:id/actions/stop',
  findInstance,
  flow.or(
    me.isOwnerOf('instance'),
    me.isModerator),
  flow.mwIf(mw.req('instance.containers').validate(validations.isPopulatedArray))
    .then(
      function (req, res, next) {
        async.forEach(req.instance.containers, function (container, cb) {
          var docker = new Docker(container.dockerHost);
          async.series([
            docker.stopContainer.bind(docker,
              container),
            Instance.updateStoppedBy.bind(Instance,
              container._id, req.sessionUser)
          ], cb);
        }, next);
      },
      instances.findById('params.id'),
      hipacheHosts.create(),
      hipacheHosts.model.removeRoutesForInstance('instance'))
    .else(mw.next(Boom.badRequest('Instance does not have any containers'))),
  mw.res.json('instance'));

/** Delete in a instance
 *  @event DELETE rest/instances/:id
 *  @memberof module:rest/instances */

var removeAllContainers = flow.series(
  // remove hipache routes
  hipacheHosts.create(),
  hipacheHosts.model.removeRoutesForInstance('instance'),
  // delete containers
  function (req, res, next) {
    async.forEach(req.instance.containers, function (container, cb) {
      var docker = new Docker(container.dockerHost);
      async.series([
        docker.stopContainer.bind(docker,
          container),
        function(req, res, next) {
          Instance.updateStoppedBy.bind(Instance,
            container._id, req.sessionUser);
          next();
        }

      ], cb);
    }, next);
  },
  // remove instance
  instances.updateById('params.id', {
    $set: { containers: [] }
  }));

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
