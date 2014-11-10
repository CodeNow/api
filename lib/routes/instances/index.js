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
var hosts = require('middlewares/redis').hosts;
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

/**
 * Body param validations for post and patch instance (name, env, build)
 * @param {String} body.name   name to set on the instance
 * @param {String} body.build  id of the build to be attached to the instance
 * @param {Array}  body.env    environment variables to set on the instance
 */
var bodyValidations = flow.series(
  mw.body('name').require().then(
    // If name is being changed, we should attempt
    mw.body('name').matches(/^[-_0-9a-zA-Z]+$/), // alpha-num schema validator
    mw.body().set('lowerName', 'body.name.toLowerCase()')
  ),
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
  mw.body('build').require()
    .then(
      mw.body('build').validate(validations.isObjectId),
      findBuild,
      // Make sure the build and the instance are owned by the same entity
      mw.req('instance.owner').require()
        .then(
          mw.req('build.owner.github').validate(validations.equalsKeypath('instance.owner.github'))
            .else(mw.next(Boom.badRequest('Instance owner must match Build owner')))),
      mw.req('body.owner').require()
        .then(
          mw.req('build.owner.github').validate(validations.equalsKeypath('body.owner.github'))
            .else(mw.next(Boom.badRequest('Instance owner must match Build owner'))))));

/**
 * Create container save it to instance and attach network (sauron)
 * @param {Build} req.instance expects instance model to already be fetched
 * @param {Build} req.build    expects build model to already be fetched
 */
var createSaveAndNetworkContainer = flow.series(
  // host LOCK must be acquired PRIOR to calling this (not necessary for post instances)!
  findBuildContextVersion,
  mavis.create(),
  mavis.model.findDock('container_run', 'contextVersion.dockerHost'),
  mw.req().set('dockerHost', 'mavisResult'),
  flow.try(
    docker.create('dockerHost'),
    docker.model.createContainerForVersion('contextVersion', {
      create: { Env: 'instance.env' }
    }),
    mw.req().set('containerInfo', 'dockerResult'))
  .catch(
    mw.req().setToErr('containerCreateErr'),
    instances.model.modifyContainerCreateErr('containerCreateErr')),
  mw.req('containerCreateErr').require()
    .else( // container create was successful
      instances.model.modifySetContainer('containerInfo'),
      mw.req('containerInfo.State.Running').validate(validations.equals(true))
        .then( // sauron can only be attached to a running container
          sauron.create('dockerHost'),
          sauron.model.attachHostToContainer(
            'instance.network.networkIp',
            'instance.network.hostIp',
            'instance.container.dockerContainer'))));

/** Remove instance container
 *  @param {String} instanceKey request key which value is the instance
 * */
var removeInstanceContainer = flow.series(
  // host LOCK must be acquired PRIOR to calling this (not necessary for post instances)!
  hosts.create(),
  mw.req().set('container', 'instance.container'),
  // remove from mongo
  instances.model.modifyUnsetContainer(),
  mw.req('container.dockerContainer').require()
    .then( // has a docker container
      // get owner username
      mw.req().set('user', 'sessionUser'),
      users.model.findGithubUserByGithubId('instance.owner.github'),
      checkFound('user', 'Owner not found'),
      mw.req().set('ownerUsername', 'user.login'),
      // remove hosts - donot background this task, since it requires lock
      hosts.model.removeHostsForInstance('ownerUsername', 'instance'),
      function (req, res, next) { // BACKGROUND remove - sauron and docker
        flow.series(
          docker.create('container.dockerHost'),
          flow.try(
            // TODO: work with anand to make sauron method ignore "container not running" error
            docker.model.inspectContainer('container'),
            mw.req().set('containerInfo', 'dockerResult'),
            // detach container from sauron BEFORE container stop
            mw.req('containerInfo.State.Running').validate(validations.equals(true))
              .then( // sauron can only be attached to a running container
                sauron.create('container.dockerHost'),
                sauron.model.detachHostFromContainer(
                  'instance.network.networkIp',
                  'instance.network.hostIp',
                  'container.dockerContainer')))
          .catch(
            error.logIfErrMw),
          // remove from docker, AFTER sauron detachment
          docker.model.stopContainer('container', true), //true means ignore already stopped error
          docker.model.removeContainer('container')
        )(req, res, error.logIfErr);
        // NEXT, to 'background' tasks
        next();
      }));

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

/** Creates a new instance for the provided build.
 *  @params body.build           Id of the Build to build an instance off of
 *  @params body.name            name of the instance
 *  @params body.parent  id of the parent instance
 *  @event POST rest/instances
 *  @memberof module:rest/instances */
app.post('/instances/',
  mw.body('build').require().validate(validations.isObjectId),
  mw.body('name', 'owner', 'env', 'parent', 'build').pick(),
  // validate body types
  mw.body('owner.github').require()
    .then(
      mw.req('isInternalRequest').require() // skip owner check if internal
        .else(me.isOwnerOf('body')))
    .else( // if not provided set it to build owner
      findBuild,
      mw.body().set('owner', 'build.owner')),
  bodyValidations,
  mw.body('name').require()
    .else( // if name is not provided generate one
      // this must occur after owner check/set
      instanceCounter.nextForOwner('body.owner'),
      function (req, res, next) {
        req.instanceName = 'Instance'+req.instanceCounter;
        next();
      },
      mw.body().set('name', 'instanceName')),
  instanceCounter.nextHash(),
  mw.req().set('nextHash', 'instanceCounter'),
  instances.create({
    shortHash: 'nextHash',
    createdBy: { github: 'sessionUser.accounts.github.id' },
    build: 'build._id'
  }),
  // get owner username
  mw.req().set('user', 'sessionUser'),
  users.model.findGithubUserByGithubId('body.owner.github'),
  checkFound('user', 'Owner not found'),
  mw.req().set('ownerUsername', 'user.login'),
  // acquire lock
  hosts.create(),
  hosts.model.acquireHostLock('ownerUsername', 'body.name'),
  flow.try(
    findBuildContextVersion,
    mw.body().set('contextVersion', 'contextVersion'),
    instances.model.set('body'),
    sauron.createWithAnyHost(),
    mw.req().set('sauron', 'sauronResult'),
    sauron.model.findOrCreateHostForInstance('instance'),
    mw.req().set('networkInfo', 'sauronResult'),
    flow.try( // if anything after network-allocation fails, dealloc networkIp/hostIp
      instances.model.set({ network: 'networkInfo' }),
      // If the build has completed, but hasn't failed, create the container
      builds.findById('build._id'), // to avoid race with build route!
      instances.model.save(),
      mw.req('build.successful').validate(validations.equals(true))
        .then(
          // no create lock necessary for new instances..
          createSaveAndNetworkContainer,
          // upsert new hosts
          hosts.model.upsertHostsForInstance('ownerUsername', 'instance'),
          // release host lock
          hosts.model.releaseHostLock('ownerUsername', 'body.name')))
    .catch( // dealloc networkIp/hostIp
      mw.req().setToErr('err'),
      flow.try(
        sauron.model.deleteHost(
          'networkInfo.networkIp', 'networkInfo.hostIp'))
      .catch(
        error.logIfErrMw),
      mw.next('err') // next error
    ),
    instances.model.getGithubUsername('sessionUser'),
    instances.model.populateModelsAndContainers(),
    mw.res.send(201, 'instance'),
    function () {})
  .catch(
    mw.req().setToErr('err'),
    hosts.model.releaseHostLock('ownerUsername', 'body.name'),
    mw.next('err'))
);

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

/**
 * deploy successful build to container
 */
var deploySuccessfulBuild = flow.series(
  mw.req().set('deployedSuccessfulBuild', true),
  // get owner username
  mw.req().set('user', 'sessionUser'),
  users.model.findGithubUserByGithubId('instance.owner.github'),
  checkFound('user', 'Owner not found'),
  mw.req().set('ownerUsername', 'user.login'),
  // acquire locks
  hosts.create(),
  mw.body('name').require()
    .then(
      mw.req().set('newName', 'body.name'),
      hosts.model.acquireHostLock('ownerUsername', 'newName')),
    mw.req().set('oldName', 'instance.name'),
    hosts.model.acquireHostLock('ownerUsername', 'oldName'),
  flow.try(
    // UPDATE INSTANCE with BODY - FIRST to ensure there is no conflict (name)
    instances.model.update({ $set: 'body' }),
    // remove old container
    removeInstanceContainer,
    // create container
    createSaveAndNetworkContainer,
    // upsert new hosts
    hosts.model.upsertHostsForInstance('ownerUsername', 'instance'),
    // remove old hosts - LAST least important
    mw.body('name').require()
      .then(hosts.model.removeHostsForInstance('ownerUsername', 'instance'))) // FIXME
  .catch(
    mw.req().setToErr('err'),
    // release locsk if error occurred
    hosts.model.releaseHostLock('ownerUsername', 'oldName'),
    mw.body('name').require()
      .then(hosts.model.releaseHostLock('ownerUsername', 'newName')),
    mw.next('err')),
  // release locks
  hosts.model.releaseHostLock('ownerUsername', 'oldName'),
  mw.body('name').require()
    .then(hosts.model.releaseHostLock('ownerUsername', 'newName')));

/**
 * update hosts for container (dns, hipache)
 */
var ifNameChangedUpdateHosts = flow.series(
  mw.body('name').require()
    .then( // name was updated (and build wasnt)
      mw.req().set('oldName', 'instance.name'),
      mw.req().set('newName', 'body.name'),
      // get owner username
      mw.req().set('user', 'sessionUser'),
      users.model.findGithubUserByGithubId('instance.owner.github'),
      checkFound('user', 'Owner not found'),
      mw.req().set('ownerUsername', 'user.login'),
      // acquire locks
      hosts.create(),
      hosts.model.acquireHostLock('ownerUsername', 'oldName'),
      hosts.model.acquireHostLock('ownerUsername', 'newName'),
      flow.try(
        // UPDATE INSTANCE with BODY - FIRST to ensure new name is available
        instances.model.update({ $set: 'body' }),
        // upsert new hosts
        hosts.model.upsertHostsForInstance('ownerUsername', 'instance'),
        // remove old hosts - LAST least important
        hosts.model.removeHostsForInstance('ownerUsername', 'instance')) // FIXME
      .catch(
        mw.req().setToErr('err'),
        // release locks if error occurred
        hosts.model.releaseHostLock('ownerUsername', 'oldName'),
        hosts.model.releaseHostLock('ownerUsername', 'newName'),
        mw.next('err')
      ),
      // release locks
      hosts.model.releaseHostLock('ownerUsername', 'oldName'),
      hosts.model.releaseHostLock('ownerUsername', 'newName')));

/** Route for redeploying an instance with a new build.  This route should first
 *  @event PATCH rest/instances/:id
 *  @memberof module:rest/instances */
app.patch('/instances/:id',
  findInstance,
  flow.or(
    me.isOwnerOf('instance'),
    me.isModerator),
  // Check for non-changes
  mw.body('name.toLowerCase()').validate(validations.equals('instance.lowerName'))
    .then(
      mw.body().unset('name')),
  mw.body('build').validate(validations.equals('instance.build.toString()'))
    .then(
      mw.body().unset('build')),
  mw.body({ or: ['public', 'name', 'build', 'env']}).require().pick(),
  bodyValidations,
  mw.body({ or: ['build', 'name'] }).require()
    .then(
      mw.body('build').require()
        .then( // build was updated
          findBuildContextVersion,
          mw.body().set('contextVersion', 'contextVersion'),
          mw.req('build.successful').validate(validations.equals(true))
            .then(
              deploySuccessfulBuild)
            .else( // in-progress or errored build
              // UPDATE INSTANCE with BODY - FIRST to ensure there is no conflict (name)
              instances.model.update({ $set: 'body' }),
              instances.findById('instanceId'),
              // remove old container
              removeInstanceContainer)),
      // Within mw.body({ or: ['build', 'name'] }).require()
      mw.req('deployedSuccessfulBuild').require()
        .else( // (body.name && (!body.build || !body.build.successful)) - update hosts only
          // UPDATE INSTANCE with BODY - FIRST to ensure there is no conflict (name)
          instances.model.update({ $set: 'body' }),
          instances.findById('instanceId'),
          ifNameChangedUpdateHosts))
    .else(
      // UPDATE INSTANCE with BODY - no name or build changes just update mongo
      instances.model.update({ $set: 'body' }),
      instances.findById('instanceId')),
  instances.model.getGithubUsername('sessionUser'),
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
  removeInstanceContainer,
  mw.req('instance.network').require()
    .then(
      // means both network and host exist
      sauron.createWithAnyHost(),
      mw.req().set('sauron', 'sauronResult'),
      sauron.model.deleteHost('instance.network.networkIp', 'instance.network.hostIp')),
  // remove instance
  instances.removeById('instanceId'),
  // TODO: if deleting last instance for an org we can delete the network
  // beware of race with create
  mw.res.send(204));

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
  // get owner username
  mw.req().set('user', 'sessionUser'),
  users.model.findGithubUserByGithubId('instance.owner.github'),
  checkFound('user', 'Owner not found'),
  mw.req().set('ownerUsername', 'user.login'),
  // acquire lock
  hosts.create(),
  hosts.model.acquireHostLock('ownerUsername', 'instance.name'),
  flow.try(
    // update context version
    findBuildContextVersion,
    instances.model.update({ $set: { contextVersion: 'contextVersion' } }),
    // remove old container
    removeInstanceContainer,
    // create container
    createSaveAndNetworkContainer,
    // upsert new hosts (overwrites old ones)
    hosts.model.upsertHostsForInstance('ownerUsername', 'instance'))
  .catch(
    mw.req().setToErr('err'),
    // release lock if error occurred
    hosts.model.releaseHostLock('ownerUsername', 'instance.name'),
    mw.next('err')),
  // release lock
  hosts.model.releaseHostLock('ownerUsername', 'instance.name'),
  instances.model.populateModelsAndContainers(),
  mw.req().set('instance.owner.username', 'ownerUsername'),
  mw.res.json('instance'));

/** Start instance container
 *  @event PUT rest/instances/:id
 *  @memberof module:rest/instances */
app.put('/instances/:id/actions/start',
  findInstance,
  flow.or(
    me.isOwnerOf('instance'),
    me.isModerator),
  mw.req('instance.container.dockerContainer').require()
    .else(
      mw.next(Boom.badRequest('Instance does not have a container'))),
  // get owner username
  mw.req().set('user', 'sessionUser'),
  users.model.findGithubUserByGithubId('instance.owner.github'),
  checkFound('user', 'Owner not found'),
  mw.req().set('ownerUsername', 'user.login'),
  // acquire lock
  hosts.create(),
  hosts.model.acquireHostLock('ownerUsername', 'instance.name'),
  flow.try(
    // start container
    docker.create('instance.container.dockerHost'),
    docker.model.startContainer('instance.container'),
    // upsert new hosts (overwrites old ones)
    hosts.model.upsertHostsForInstance('ownerUsername', 'instance'))
  .catch(
    mw.req().setToErr('err'),
    // release lock if error occurred
    hosts.model.releaseHostLock('ownerUsername', 'instance.name'),
    mw.next('err')),
  hosts.model.releaseHostLock('ownerUsername', 'instance.name'),
  instances.model.populateModelsAndContainers(),
  mw.req().set('instance.owner.username', 'ownerUsername'),
  mw.res.json('instance'));

/** Start instance container
 *  @event PUT rest/instances/:id
 *  @memberof module:rest/instances */
app.put('/instances/:id/actions/restart',
  findInstance,
  flow.or(
    me.isOwnerOf('instance'),
    me.isModerator),
  mw.req('instance.container.dockerContainer').require()
    .else(
      mw.next(Boom.badRequest('Instance does not have a container'))),
  // get owner username
  mw.req().set('user', 'sessionUser'),
  users.model.findGithubUserByGithubId('instance.owner.github'),
  checkFound('user', 'Owner not found'),
  mw.req().set('ownerUsername', 'user.login'),
  // acquire lock
  hosts.create(),
  hosts.model.acquireHostLock('ownerUsername', 'instance.name'),
  flow.try(
    // restart container
    docker.create('instance.container.dockerHost'),
    docker.model.restartContainer('instance.container'),
    // upsert new hosts (overwrites old ones)
    hosts.model.upsertHostsForInstance('ownerUsername', 'instance'))
  .catch(
    mw.req().setToErr('err'),
    // release lock if error occurred
    hosts.model.releaseHostLock('ownerUsername', 'instance.name'),
    mw.next('err')),
  hosts.model.releaseHostLock('ownerUsername', 'instance.name'),
  instances.model.populateModelsAndContainers(),
  mw.req().set('instance.owner.username', 'ownerUsername'),
  mw.res.json('instance'));

/** Stop instance container
 *  @event PUT rest/instances/:id
 *  @memberof module:rest/instances */
app.put('/instances/:id/actions/stop',
  findInstance,
  flow.or(
    me.isOwnerOf('instance'),
    me.isModerator),
  mw.req('instance.container.dockerContainer').require()
    .else(
      mw.next(Boom.badRequest('Instance does not have a container'))),
  // get owner username
  mw.req().set('user', 'sessionUser'),
  users.model.findGithubUserByGithubId('instance.owner.github'),
  checkFound('user', 'Owner not found'),
  mw.req().set('ownerUsername', 'user.login'),
  // acquire lock
  hosts.create(),
  hosts.model.acquireHostLock('ownerUsername', 'instance.name'),
  flow.try(
    // todo: doesnt matter either way - to delete or not
    // // delete hosts
    // hosts.model.deleteHostsForInstance('ownerUsername', 'instance')
    // stop container
    docker.create('instance.container.dockerHost'),
    docker.model.stopContainer('instance.container'))
  .catch(
    mw.req().setToErr('err'),
    // release lock if error occurred
    hosts.model.releaseHostLock('ownerUsername', 'instance.name'),
    mw.next('err')),
  hosts.model.releaseHostLock('ownerUsername', 'instance.name'),
  instances.model.populateModelsAndContainers(),
  mw.req().set('instance.owner.username', 'ownerUsername'),
  mw.res.json('instance'));

