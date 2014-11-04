'use strict';

/**
 * Instance API
 * @module rest/instances
 */

var express = require('express');
var app = module.exports = express();
var flow = require('middleware-flow');
var mw = require('dat-middleware');

var me = require('middlewares/me');
var mongoMiddlewares = require('middlewares/mongo');
var instances = mongoMiddlewares.instances;
//var users = mongoMiddlewares.users;
var contextVersions = mongoMiddlewares.contextVersions;
var builds = mongoMiddlewares.builds;
var users = mongoMiddlewares.users;
var instanceCounter = mongoMiddlewares.instanceCounters;
var validations = require('middlewares/validations');
var github = require('middlewares/apis').github;
var docker = require('middlewares/apis').docker;
var mavis = require('middlewares/apis').mavis;
var sauron = require('middlewares/apis').sauron;
var isInternal = require('middlewares/is-internal-request.js');
var runnable = require('middlewares/apis').runnable;
var hipacheHosts = require('middlewares/redis').hipacheHosts;
var transformations = require('middlewares/transformations');
var checkFound = require('middlewares/check-found');
var error = require('error');
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

var findBuildContextVersion = flow.series(
  mw.req('build.contextVersions.length').validate(validations.notEquals(0))
    .else(mw.next(Boom.badRequest('Build must have a contextVersion'))),
  contextVersions.findById('build.contextVersions[0]'),
  checkFound('contextVersion'),
  mw.req('contextVersion.build.started').require()
    .else(
      mw.next(Boom.badRequest(
        'Cannot attach a build to an instance with context '+
        'versions that have not started building'))));

/** Get's the list of instances to be displayed to the user.  This should contain all of the
 * instances owned by the owner, as well as those owned by groups (s)he is part of
 *  @event GET rest/instances
 *  @memberof module:rest/instances */
app.get('/instances/',
  mw.query({or: ['owner.github', 'githubUsername']}).require(),
  mw.query('githubUsername').require()
    .then(
    github.create(),
    github.model.getUserByUsername('query.githubUsername'),
    mw.query().set('owner.github', 'githubResult.id')),
  mw.query({or: ['owner', 'shortHash', 'name']}).require(),
  mw.query('owner', 'shortHash', 'name').pick(),
  mw.query('owner.github').mapValues(transformations.toInt).number(),
  me.isOwnerOf('query'),
  instances.find('query'),
  instances.models.getGithubUsername('sessionUser'),
  instances.models.populateModelsAndContainers(),
  mw.res.json('instances'));

var updateHipacheRoutes = flow.series(
  instances.model.updateInspectedContainerData(),
  instances.findById('instanceId'),
  mw.req().set('user', 'sessionUser'),
  users.model.findGithubUserByGithubId('instance.owner.github'),
  checkFound('user', 'Owner not found'),
  hipacheHosts.create(),
  hipacheHosts.model.createRoutesForInstance('user.login', 'instance'));

var removeHipacheRoutes = flow.series(
  instances.findById('instanceId'),
  mw.req().set('user', 'sessionUser'),
  users.model.findGithubUserByGithubId('instance.owner.github'),
  checkFound('user', 'Owner not found'),
  hipacheHosts.create(),
  hipacheHosts.model.removeRoutesForInstance('user.login', 'instance'));

/** Create instance container for contextVersion
 *  @param {String} instanceKey request key which value is the instance
 *  @param {String} contextVersionKey request key which value is the contextVersion
 * */
var saveInstanceContainer = flow.series(
  contextVersions.findById('build.contextVersions[0]'),
  mw.req('contextVersion.build.completed').require()
    .else(mw.next(Boom.badRequest('Cannot create an instance from a unbuilt build'))),
  mavis.create(),
  mavis.model.findDock('container_run', 'contextVersion.dockerHost'),
  flow.try(
    docker.create('mavisResult'),
    mw.req('instance.isNew').require()
      .then(
        // call from POST /instances - instance does not exist yet.. create it.
        mw.req().set('instanceId', 'instance._id'),
        instances.model.setAndSaveContainerCreateStarted('mavisResult')
      ).else(
        instances.model.updateContainerCreateStarted('mavisResult')
      ),
    docker.model.createContainerForVersion('contextVersion', {
      create: { Env: 'instance.env' }
    }),
    mw.req().set('containerInfo', 'dockerResult')
  ).catch(
    mw.req().setToErr('containerCreateErr'),
    instances.model.updateContainerCreateError('containerCreateErr')
  ),
  instances.model.updateContainerCreateCompleted(),
  instances.findById('instanceId'),
  mw.req('instance.container.create.error').require()
    .else( // container create was successful
      instances.model.updateContainer('containerInfo'),
      instances.findById('instanceId'),
      mw.req('containerInfo.State.Running').validate(validations.equals(true))
        .then(
          sauron.create('mavisResult'),
          sauron.model.attachHostToContainer(
            'instance.network.networkIp',
            'instance.network.hostIp',
            'instance.container.dockerContainer'),
          mw.req().set('instanceId', 'instance._id'),
          updateHipacheRoutes)));

/** Remove instance container
 *  @param {String} instanceKey request key which value is the instance
 * */
var removeInstanceContainer = flow.series(
  // remove hipache routes
  removeHipacheRoutes,
  // cache container
  mw.req().set('container', 'instance.container'),
  // remove from mongo
  instances.model.update({ $unset: { container: 1 } }),
  instances.findById('instanceId'),
  // remove from docker
  function (req, res, next) {
    // background tasks, log if error occurs
    if (req.instance.network && req.instance.network.networkIp) {
      flow.series(
        sauron.create('container.dockerHost'),
        sauron.model.detachHostFromContainer(
          'instance.network.networkIp',
          'instance.network.hostIp',
          'container.dockerContainer')
      )(req, res, error.logIfErr);
    }
    if (req.container) {
      flow.series(
        docker.create('container.dockerHost'),
        docker.model.stopContainer('container', true),
        docker.model.removeContainer('container')
      )(req, res, error.logIfErr);
    }
    // next immediately
    next();
  });



/** Get's the list of instances to be displayed to the user.  This should contain all of the
 * instances owned by the owner, as well as those owned by groups (s)he is part of
 *  @event GET rest/instances
 *  @memberof module:rest/instances */
app.get('/instances/',
  mw.query({or: ['owner.github', 'shortHash']}).require(),
  mw.query('owner', 'shortHash').pick(),
  mw.query('owner.github').require().then(
    mw.query('owner.github').mapValues(transformations.toInt).number(),
    me.isOwnerOf('query')),
  instances.find('query'),
  instances.models.getGithubUsername('sessionUser'),
  instances.models.populateModelsAndContainers(),
  mw.res.json('instances'));

/** Creates a new instance for the provided build.
 *  @params body.build           Id of the Build to build an instance off of
 *  @params body.name            name of the instance
 *  @params body.parent  id of the parent instance
 *  @event POST rest/instances
 *  @memberof module:rest/instances */
app.post('/instances/',
  mw.body('build').require().validate(validations.isObjectId),
  findBuild,
  mw.body('name', 'owner', 'env', 'parent').pick(),
  // validate body types
  mw.body('owner.github').require()
    .then(
      mw.req('isInternalRequest').require() // skip owner check if internal
        .else(me.isOwnerOf('body')),
      mw.req('build.owner.github').validate(validations.equalsKeypath('body.owner.github'))
        .else(mw.next(Boom.badRequest('Body owner must match Build owner')))
    ).else( // if not provided set it to build owner
      mw.body().set('owner', 'build.owner')),
  instanceCounter.nextHash(),
  mw.req().set('nextHash', 'instanceCounter'),
  // this must occur after owner check/set
  instanceCounter.nextForOwner('body.owner'),
  mw.body('name').require()
    .else(function (req, res, next) {
      req.instanceName = 'Instance'+req.instanceCounter;
      next();
    },
    mw.body().set('name', 'instanceName')),
  mw.body('env').require()
    .then(
      mw.body('env').array()
        .validate(validations.isArrayOf('string')),
      mw.body('env').each(
        function (env, req, eachReq, res, next) {
          eachReq.env = env;
          next();
        },
        mw.req('env').matches(/^([A-Za-z]+[A-Za-z0-9_]*)=('(\n[^']*')|("[^"]*")|([^\s#]+))$/))),
  instances.create({
    shortHash: 'nextHash',
    createdBy: { github: 'sessionUser.accounts.github.id' },
    build: 'build._id'
  }),
  instances.model.set('body'),
  sauron.createWithAnyHost(),
  mw.req().set('sauron', 'sauronResult'),
  sauron.model.findOrCreateHostForInstance('instance'),
  mw.req().set('networkInfo', 'sauronResult'),
  flow.try(
    instances.model.set({ network: 'sauronResult' }),
    findBuildContextVersion,
    instances.model.set({ contextVersion: 'contextVersion' }),
    // If the build has completed, but hasn't failed, create the container
    mw.req('build.successful').validate(validations.equals(true))
      .then(
        saveInstanceContainer)
      .else(instances.model.save())
  ).catch(
    mw.req().setToErr('err'),
    flow.try(
      sauron.model.deleteHost(
        'networkInfo.networkIp', 'networkInfo.hostIp')
    ).catch(
      error.logIfErrMw),
    mw.next('err')
  ),
  instances.model.getGithubUsername('sessionUser'),
  instances.model.populateModelsAndContainers(),
  mw.res.send(201, 'instance'));

/** Get in a instance
 *  @event GET rest/instances/:id
 *  @memberof module:rest/instances */
app.get('/instances/:id',
  findInstance,
  flow.or(
    me.isOwnerOf('instance'),
    instances.model.isPublic(),
    me.isModerator),
  instances.model.getGithubUsername('sessionUser'),
  instances.model.populateModelsAndContainers(),
  mw.res.json('instance'));

/** Route for redeploying an instance with a new build.  This route should first
 *  @event PATCH rest/instances/:id
 *  @memberof module:rest/instances */
app.patch('/instances/:id',
  findInstance,
  flow.or(
    me.isOwnerOf('instance'),
    me.isModerator),
  mw.body({ or: ['public', 'name', 'build', 'env']}).require().pick(),
  mw.body('name').require().then(
    // If name is being changed, we should attempt
    mw.body('name').matches(/^[-_0-9a-zA-Z]+$/), // alpha-num schema validator
    mw.body().set('lowerName', 'body.name.toLowerCase()')
  ),
  // validate body types
  mw.body('env').require()
    .then(
      mw.body('env').array()
        .validate(validations.isArrayOf('string')),
      mw.body('env').each(
        function (env, req, eachReq, res, next) {
          eachReq.env = env;
          next();
        },
        mw.req('env').matches(/^([A-Za-z]+[A-Za-z0-9_]*)=('(\n[^']*')|("[^"]*")|([^\s#]+))$/))),
  mw.body({ or: ['name', 'build']}).require()
    .then(
      mw.body('build').require()
        .then(
          // This will get hit if the build is changing, or both the build and name.  We don't want
          // to do the hipache stuff twice in the case of both, so this covers both cases
          mw.body('build').require().validate(validations.isObjectId),
          findBuild,
          // Make sure the build and the instance are owned by the same entity
          mw.req('build.owner.github').validate(validations.equalsKeypath('instance.owner.github'))
            .else(
              mw.next(Boom.badRequest('Instance owner must match Build owner'))),
          // Grab context version from the build, add update the instance
          findBuildContextVersion,
          removeInstanceContainer, // remove old container, even if build is not complete
          // toJSON is required else mongoose inf loops
          mw.body().set('contextVersion', 'contextVersion.toJSON()'),
          instances.updateById('instanceId', { $set: 'body' }),
          instances.findById('instanceId'),
          mw.req('build.successful').validate(validations.equals(true))
            .then(
              saveInstanceContainer)
        ).else( // body.name no build
          mw.req('instance.container').require()
            .then(removeHipacheRoutes),
          instances.updateById('instanceId', { $set: 'body' })),
          instances.findById('instanceId'),
          mw.req('instance.container').require()
            .then(updateHipacheRoutes)
    ).else(
      instances.updateById('instanceId', { $set: 'body' })),
  instances.findById('instanceId'),
  instances.model.getGithubUsername('sessionUser'),
  instances.model.populateModelsAndContainers(),
  mw.res.json('instance'));

/**
 * Fork should deep copy an instance, as well as deep copy it's current build.  We don't want
 * to shallow copy because it could lead to a rebuild of one instance rebuilding multiple ones.
 *
 * @params id: of the instance to fork
 * @body owner: Either this user, or their associated org
 */
app.post('/instances/:id/actions/copy',
  findInstance,
  flow.or(
    me.isOwnerOf('instance'),
    instances.model.isPublic(),
    me.isModerator),
  // The best way to clone an instance is to just use the post route
  // If we deep copy the build, we can attach its id to the body, and just use the post route
  findBuild,
  mw.body('name').require()
    .then(
      mw.body('name').string()),
  runnable.create({}, 'sessionUser'),
  // Now that the copied build is in the runnableResult, we can send it to the createInstance route
  runnable.model.copyInstance('build', 'instance', 'body.name'),
  // Now return the new instance
  mw.res.status(201),
  mw.res.json('runnableResult')
);

/** Creates all of the container required for the current build of an instance
 *  @event PUT rest/instances/:id/a
 *  @params id: instance id
 */
app.post('/instances/:id/actions/redeploy',
  isInternal,
  findInstance,
  flow.or(
    me.isOwnerOf('instance'),
    me.isModerator),
  findBuild,
  mw.req('build.successful').validate(validations.equals(true))
    .else(mw.next(Boom.badRequest('Cannot deploy an instance with an unsuccessful build'))),
  // if build is on instance we can assume it has cVs (and are done)
  contextVersions.findById('build.contextVersions[0]'),
  mw.req('instance.container').require()
    .then(removeInstanceContainer),
  instances.findById('instanceId'),
  saveInstanceContainer,
  instances.model.populateModelsAndContainers(),
  mw.res.json('instance'));

/** Start instance container
 *  @event PUT rest/instances/:id
 *  @memberof module:rest/instances */
app.put('/instances/:id/actions/start',
  findInstance,
  flow.or(
    me.isOwnerOf('instance'),
    me.isModerator),
  mw.req('instance.container').require()
    .then(
      docker.create('instance.container.dockerHost'),
      docker.model.startContainer('instance.container'),
      sauron.create('instance.container.dockerHost'),
      sauron.model.attachHostToContainer(
        'instance.network.networkIp',
        'instance.network.hostIp',
        'instance.container.dockerContainer'),
      updateHipacheRoutes)
    .else(mw.next(Boom.badRequest('Instance does not have a container'))),
  instances.model.populateModelsAndContainers(),
  mw.res.json('instance'));

/** Start instance container
 *  @event PUT rest/instances/:id
 *  @memberof module:rest/instances */
app.put('/instances/:id/actions/restart',
  findInstance,
  flow.or(
    me.isOwnerOf('instance'),
    me.isModerator),
  mw.req('instance.container').require()
    .then(
      sauron.create('instance.container.dockerHost'),
      sauron.model.detachHostFromContainer(
        'instance.network.networkIp',
        'instance.network.hostIp',
        'instance.container.dockerContainer'),
      docker.create('instance.container.dockerHost'),
      docker.model.restartContainer('instance.container'),
      sauron.model.attachHostToContainer(
        'instance.network.networkIp',
        'instance.network.hostIp',
        'instance.container.dockerContainer'),
      updateHipacheRoutes)
    .else(mw.next(Boom.badRequest('Instance does not have a container'))),
  instances.model.populateModelsAndContainers(),
  mw.res.json('instance'));

/** Stop instance container
 *  @event PUT rest/instances/:id
 *  @memberof module:rest/instances */
app.put('/instances/:id/actions/stop',
  findInstance,
  flow.or(
    me.isOwnerOf('instance'),
    me.isModerator),
  mw.req('instance.container').require()
    .then(
      docker.create('instance.container.dockerHost'),
      docker.model.inspectContainer('instance.container'),
      mw.req('dockerResult.State.Running').validate(validations.equals(false))
        .then(function (req, res, next) {
          // FIXME: hack for now - we need a way of transporting 300 errors to the user
          // other than boom..
          var boomErr = Boom.create(400, 'Container not running');
          boomErr.output.statusCode = 304;
          next(boomErr);
        }),
      sauron.create('instance.container.dockerHost'),
      sauron.model.detachHostFromContainer(
        'instance.network.networkIp',
        'instance.network.hostIp',
        'instance.container.dockerContainer'),
      docker.model.stopContainer('instance.container'),
      removeHipacheRoutes)
    .else(mw.next(Boom.badRequest('Instance does not have a container'))),
  instances.model.populateModelsAndContainers(),
  mw.res.json('instance'));

/** Delete in a instance
 *  @event DELETE rest/instances/:id
 *  @memberof module:rest/instances */
app.delete('/instances/:id',
  findInstance,
  flow.or(
    me.isOwnerOf('instance'),
    me.isModerator),
  mw.req('instance.container').require()
    .then(
      removeInstanceContainer,
  mw.req('instance.network').require()
    .then(
      // means both network and host exist
      sauron.createWithAnyHost(),
      mw.req().set('sauron', 'sauronResult'),
      sauron.model.deleteHost('instance.network.networkIp', 'instance.network.hostIp'))),
  // remove instance
  instances.removeById('instanceId'),
  // TODO: if deleting last instance for an org we can delete the network
  // beware of race with create
  mw.res.send(204));
