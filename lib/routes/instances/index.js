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
//var users = mongoMiddlewares.users;
var contextVersions = mongoMiddlewares.contextVersions;
var builds = mongoMiddlewares.builds;
var instanceCounter = mongoMiddlewares.instanceCounters;
var validations = require('middlewares/validations');
//var github = require('middlewares/apis').github;
var docker = require('middlewares/apis').docker;
var isInternal = require('middlewares/is-internal-request.js');
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
  mw.body('build').require()
    .then(builds.findById('body.build'))
    .else(builds.findById('instance.build')),
  checkFound('build'),
  flow.or(
    me.isOwnerOf('build'),
    me.isModerator),
  mw.req('build.started').require()
    .else(mw.next(Boom.badRequest('Instances cannot use builds that haven\'t been started'))));

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
  instances.models.populateModelsAndContainers(),
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

var removeAllContainers = flow.series(
  // remove hipache routes
  hipacheHosts.create(),
  hipacheHosts.model.removeRoutesForInstance('instance'),
  // remove containers
  mw.req('instance.containers').each(
    function (container, req, eachReq, res, next) {
      eachReq.container = container;
      next();
    },
    docker.create('container.dockerHost'),
    flow.try(
      docker.model.stopContainer('container')
    ).catch(
      function (err, eachReq, res, next) {
        if (err.data.err.reason !== 'container already stopped') {
          next(err);
        } else {
          next();
        }
      }
    ),
    instances.updateStoppedBy('container.id', 'sessionUser'),
    docker.model.removeContainer('container')),
  // remove containers from instance
  instances.model.update({
    $set: { containers: [] }
  }));

/** Creates a new instance for the provided build.
 *  // FIXME: @tj - get some params in here
 *  @event POST rest/instances
 *  @params build: Id of the Build to build an instance off of
 *  @memberof module:rest/instances */
app.post('/',
  mw.body('build').require().validate(validations.isObjectId),
  findBuild,
  instanceCounter.nextHash(),
  mw.req().set('nextHash', 'instanceCounter'),
  instanceCounter.nextForOwner('build.owner'),
  mw.body('name').require()
    .else(function (req, res, next) {
      req.instanceName = 'Instance'+req.instanceCounter;
      next();
    },
    mw.body().set('name', 'instanceName')),
  mw.body('owner.github').require()
    .then(
      mw.req('isInternalRequest').require() // skip owner check if internal
        .else(me.isOwnerOf('body'))
    ).else( // if not provided set it to sessionUser
      mw.body().set('owner', 'build.owner')),
  instances.create({
    shortHash: 'nextHash',
    createdBy: { github: 'sessionUser.accounts.github.id' },
    build: 'build._id',
    name: 'body.name',
    owner: 'body.owner'
  }),
  mw.body('parentInstance').require().then(
    instances.model.set({parent: 'body.parentInstance'})),
  instances.model.save(),
  // If the build has completed, but hasn't failed, create the containers
  mw.req('build.successful')
    .require().validate(validations.equals(true)).then(
      createAllContainers),
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

/** Route for redeploying an instance with a new build.  This route should first
 *  @event PATCH rest/instances/:id
 *  @memberof module:rest/instances */
app.patch('/:id',
  findInstance,
  flow.or(
    me.isOwnerOf('instance'),
    me.isModerator),
  mw.body({ or: ['public', 'name', 'build']}).require().pick(),
  mw.body({ or: ['name', 'build']}).require()
    .then(
      mw.body('build').require()
        .then(
        // This will get hit if the build is changing, or both the build and name.  We don't want
        // to do the hipache stuff twice in the case of both, so this covers both cases
          mw.body('build').require().validate(validations.isObjectId),
          findBuild,
          mw.req('build.successful').require().then(removeAllContainers))
        // If build is included, don't do removeHipacheRoutes (It already happens when we destroy
        // the containers
        .else(removeHipacheRoutes)),
  instances.updateById('instanceId', {
    $set: 'body'
  }),
  instances.findById('instanceId'),
  mw.body({ or: ['name', 'build']}).require()
    .then(
      mw.body('build').require()
        .then(function (req, res, next) {
          next();
        },
        mw.req('build.successful').validate(validations.equals(true))
          .then(function (req, res, next) {
          next();
        },createAllContainers))
        .else(updateHipacheRoutes)),
  instances.model.populateModelsAndContainers(),
  mw.res.json('instance'));

/**
 * Fork should deep copy an instance, as well as deep copy it's current build.  We don't want
 * to shallow copy because it could lead to a rebuild of one instance rebuilding multiple ones.
 *
 * @params id: of the instance to fork
 * @body owner: Either this user, or their associated org
 */
app.post('/:id/actions/copy',
  findInstance,
  flow.or(
    me.isOwnerOf('instance'),
    instances.model.isPublic(),
    me.isModerator),
  // The best way to clone an instance is to just use the post route
  // If we deep copy the build, we can attach its id to the body, and just use the post route
  findBuild,
  runnable.create({}, 'sessionUser'),
  // Now that the copied build is in the runnableResult, we can send it to the createInstance route
  runnable.model.copyInstance('build', 'instance'),
  // Now return the new instance
  mw.res.status(201),
  mw.res.json('runnableResult')
);

/** Creates all of the containers required for the current build of an instance
 *  @event PUT rest/instances/:id/a
 *  @params id: instance id
 */
app.post('/:id/actions/redeploy',
  isInternal,
  findInstance,
  flow.or(
    me.isOwnerOf('instance'),
    me.isModerator),
  findBuild,
  mw.req('instance.containers').validate(validations.isPopulatedArray)
    .then(removeAllContainers),
  instances.findById('instanceId'),
  createAllContainers,
  instances.model.populateModelsAndContainers(),
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
