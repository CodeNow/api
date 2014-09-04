'use strict';

/**
 * Instance API
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
var users = mongoMiddlewares.users;
var contextVersions = mongoMiddlewares.contextVersions;
var builds = mongoMiddlewares.builds;
var instanceCounter = mongoMiddlewares.instanceCounters;
var validations = require('middlewares/validations');
var github = require('middlewares/apis').github;
var docker = require('middlewares/apis').docker;
var runnable = require('middlewares/apis').runnable;
var hipacheHosts = require('middlewares/redis').hipacheHosts;
var transformations = require('middlewares/transformations');
var checkFound = require('middlewares/check-found');
var Docker = require('models/apis/docker');
var Instance = require('models/mongo/instance');
var Boom = mw.Boom;

var findInstance = flow.series(
  instances.findByShortHash('params.id'),
  checkFound('instance'),
  // putting the instance._id on req so we don't lose it (and have to search by hash again)
  mw.req().set('instanceId', 'instance._id'));

var findBuild = flow.series(
  builds.findById('body.build'),
  checkFound('build'),
  flow.or(
    me.isOwnerOf('build'),
    me.isModerator));

/** Get's the list of instances to be displayed to the user.  This should contain all of the
 * instances owned by the owner, as well as those owned by groups (s)he is part of
 *  @event GET rest/instances
 *  @memberof module:rest/instances */
app.get('/',
  mw.query({or: ['owner.github', 'shortHash']}).require(),
  mw.query('owner', 'shortHash').pick(),
  mw.query('owner.github').require().then(
    mw.query('owner.github').mapValues(transformations.toInt).number(),
    me.isOwnerOf('query')),
  instances.find('query'),
  instances.models.getGithubUsername('sessionUser'),
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

/** Creates a new instance for the provided build.
 *  // FIXME: @tj - get some params in here
 *  @event POST rest/instances
 *  @params build: Id of the Build to build an instance off of
 *  @memberof module:rest/instances */
app.post('/',
  mw.body('build').require().validate(validations.isObjectId),
  findBuild,
  mw.req('build.started').require()
    .else(mw.next(Boom.badRequest('Cannot create instance from build that hasn\'t been started'))),
  instanceCounter.nextHash(),
  mw.req().set('nextHash', 'instanceCounter'),
  instanceCounter.nextForOwner('build.owner'),
  mw.body('name').require()
    .else(function (req, res, next) {
      req.instanceName = 'Instance'+req.instanceCounter;
      next();
    },
    mw.body().set('name', 'instanceName')),
  instances.create({
    shortHash: 'nextHash',
    createdBy: { github: 'sessionUser.accounts.github.id' },
    build: 'build._id',
    name: 'body.name',
    owner: 'build.owner'
  }),
  instances.model.save(),
//  runnable.create({}, 'sessionUser'),
//  runnable.model.deployInstance('instance'),
  // Or just do this.... I honestly don't like all of the overhead just to use this:
//  createAllContainers,
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
  instances.model.getGithubUsername('sessionUser'),
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
  instances.updateById('instanceId', {
    $set: 'body'
  }),
  instances.findById('instanceId'),
  mw.body('name').require()
    .then(
      hipacheHosts.create(),
      hipacheHosts.model.createRoutesForInstance('instance')),
  instances.model.populateModelsAndContainers(),
  mw.res.json('instance'));

var updateHipacheRoutes = flow.series(
  instances.findById('instanceId'),
  instances.model.updateInspectedContainerData(),
  instances.findById('instanceId'),
  hipacheHosts.create(),
  hipacheHosts.model.createRoutesForInstance('instance'));

var removeHipacheRoutes = flow.series(
  instances.findById('instanceId'),
  hipacheHosts.create(),
  hipacheHosts.model.removeRoutesForInstance('instance'));

/** Creates all of the containers required for the current build of an instance
 *  @event PUT rest/instances/:id/a
 *  @params id: instance id
 */
app.put('/:id/actions/deploy',
  findInstance,
  flow.or(
    me.isOwnerOf('instance'),
    me.isModerator),
  builds.findById('instance.build'),
  checkFound('build'),
  createAllContainers,
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
      updateHipacheRoutes)
    .else(mw.next(Boom.badRequest('Instance does not have any containers'))),
  mw.res.json('instance'));

/** Start instance containers
 *  @event PUT rest/instances/:id
 *  @memberof module:rest/instances */
app.put('/:id/actions/restart',
  findInstance,
  flow.or(
    me.isOwnerOf('instance'),
    me.isModerator),
  flow.mwIf(mw.req('instance.containers').validate(validations.isPopulatedArray))
    .then(
      removeHipacheRoutes,
      function (req, res, next) {
        async.forEach(req.instance.containers, function (container, cb) {
          var docker = new Docker(container.dockerHost);
          async.series([
            docker.restartContainer.bind(docker,
              container),
            Instance.updateStartedBy.bind(Instance,
              container._id, req.sessionUser)
          ], cb);
        }, next);
      },
      updateHipacheRoutes)
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
      removeHipacheRoutes)
    .else(mw.next(Boom.badRequest('Instance does not have any containers'))),
  mw.res.json('instance'));

/** Delete in a instance
 *  @event DELETE rest/instances/:id
 *  @memberof module:rest/instances */

var removeAllContainers = flow.series(
  // remove hipache routes
  hipacheHosts.create(),
  hipacheHosts.model.removeRoutesForInstance('instance'),
  // remove containers
  function (req, res, next) {
    async.forEach(req.instance.containers, function (container, cb) {
      var docker = new Docker(container.dockerHost);
      async.series([
        docker.stopContainer.bind(docker,
          container, function(err) {
            if (err && err.data.err.reason !== 'container already stopped') {
              cb(err);
            }
            cb();
          }),
        Instance.updateStoppedBy.bind(Instance,
          container._id, req.sessionUser),
        docker.removeContainer.bind(docker,
          container)
      ], cb);
    }, next);
  },
  // remove instance
  instances.updateById('instanceId', {
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
  instances.removeById('instanceId'),
  mw.res.send(204));
