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
var ownerIsHelloRunnable = require('middlewares/owner-is-hello-runnable');
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
var runnable = require('middlewares/apis').runnable;
var timers = require('middlewares/apis').timers;
var graph = require('middlewares/apis').graph;
var hosts = require('middlewares/redis').hosts;
var messenger = require('middlewares/socket').messenger;
var userStoppedContainer = require('middlewares/redis').userStoppedContainer;
var transformations = require('middlewares/transformations');
var checkFound = require('middlewares/check-found');
var error = require('error');
var Boom = mw.Boom;
var isInternalRequest = require('middlewares/is-internal-request');
var githubNotifications = require('middlewares/notifications').github;
var resSendAndNext = require('middlewares/send-and-next');
var noop = require('101/noop');

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
    ownerIsHelloRunnable('build'),
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
    mw.body('name').string().matches(/^[-_0-9a-zA-Z]+$/), // alpha-num schema validator
    mw.body().set('lowerName', 'body.name.toLowerCase()')
  ),
  mw.body('env').require()
    .then(
      mw.body('env').array(),
      mw.body('env').mapValues(function (envArr) {
        return envArr.filter(function (val) {
          return !(/^\s*$/.test(val));
        });
      }),
      mw.body('env').each(
        function (env, req, eachReq, res, next) {
          eachReq.env = env;
          next();
        },
        mw.req('env').matches(/^([A-Za-z]+[A-Za-z0-9_]*)=('(\n[^']*')|("[^"]*")|([^\s#]+))$/))),
  mw.body('public').require()
    .then(mw.body('public').boolean()),
  mw.body('locked').require()
    .then(mw.body('locked').boolean()),
  mw.body('parent').require().then(
    mw.body('parent').string()),
  mw.body('owner').require().then(
    mw.body('owner').validate(validations.isObject)),
  mw.body('owner.github').require().then(
    mw.body('owner.github').number()),
  mw.body('build').require()
    .then(
      mw.body('build').validate(validations.isObjectId),
      findBuild,
      // Make sure the build and the instance are owned by the same entity
      // unless build belongs to HELLO_RUNNABLE_GITHUB_ID user (getting started feature)
      mw.req('build.owner.github')
        .validate(validations.equals(process.env.HELLO_RUNNABLE_GITHUB_ID))
        .else(
          mw.req('instance.owner').require()
            .then(
              mw.req('build.owner.github')
                .validate(validations.equalsKeypath('instance.owner.github'))
                .else(mw.next(Boom.badRequest('Instance owner must match Build owner')))),
          mw.req('body.owner').require()
            .then(
              mw.req('build.owner.github').validate(validations.equalsKeypath('body.owner.github'))
                .else(mw.next(Boom.badRequest('Instance owner must match Build owner')))))));

/**
 * Create container save it to instance and attach network (sauron)
 * @param {Build} req.instance expects instance model to already be fetched
 * @param {Build} req.build    expects build model to already be fetched
 */
var createSaveAndNetworkContainer = flow.series(
  // host LOCK must be acquired PRIOR to calling this (not necessary for post instances)!
  findBuildContextVersion,
  mw.req('body.forceDock').require()
    .then(
      mw.req().set('dockerHost', 'body.forceDock'))
    .else(
      mavis.create(),
      mavis.model.findDockForContainer('contextVersion'),
      mw.req().set('dockerHost', 'mavisResult')),
  flow.try(
    docker.create('dockerHost'),
    docker.model.createUserContainer('contextVersion', { Env: 'instance.env' }),
    mw.req().set('containerInfo', 'dockerResult'))
  .catch(
    mw.req().setToErr('containerCreateErr'),
    mw.req('containerCreateErr.output.statusCode').validate(validations.equals(404))
      .then(
        mw.req().set('containerCreateErr.imageIsPulling', true)),
    instances.model.modifyContainerCreateErr(
      'contextVersion._id', 'containerCreateErr'),
    mw.req('containerCreateErr.imageIsPulling').validate(validations.equals(true))
      .then(
        docker.model.pullImage('contextVersion'),
        messenger.emitImagePulling('instance', 'dockerResult'),
        function(req, res, next) {
          // on pull finish, redeploy instance
          req.dockerResult.on('end', function () {
            flow.series(
              runnable.create({}, 'sessionUser'),
              runnable.model.deployInstance('instance', {
                forceDock: 'dockerHost',
                json: { build: 'build._id.toString()' }
              }))(req, res, function (err) {
                error.logIfErr(err, req);
              });
          });
          // next immediately, background pull and redeploy
          next();
        })),
  mw.req('containerInfo').require()
    .then( // container create was successful
      instances.model.modifyContainer(
        'contextVersion._id', 'containerInfo.Id', 'dockerHost'),
      flow.try(
        docker.model.startUserContainer('containerInfo')
      ).catch(
        // we've seen layer limit errors bubble from startContainer
        mw.req().setToErr('containerStartErr'),
        instances.model.modifyContainerCreateErr(
          'contextVersion._id', 'containerStartErr')
      ),
      mw.req('instance.container.dockerContainer').require()
        .then( // container created and started successfully
          instances.model.inspectAndUpdate(),
          sauron.create('dockerHost'),
          sauron.model.attachHostToContainer(
            'instance.network.networkIp',
            'instance.network.hostIp',
            'instance.container.dockerContainer'),
          // upsert new hosts
          hosts.model.upsertHostsForInstance('ownerUsername', 'instance')
        )
    )
  );

/** Remove instance container
 *  @param {String} instanceKey      instance key on req
 *  @param {String} oldContainerKey  instance's old container key on req
 *  @param {String} instanceNameKey  instance's name (in hosts to remove) key on req
 *  @param {String} ownerUsernameKey instance's owner's username key on req
 *  // also assumes req.instance exists
 * */
var removeInstanceContainer = // TODO: this has a lot of overlap with instance stop
  function (instanceKey, oldContainerKey, instanceNameKey, ownerUsernameKey) {
    return flow.series(
      // host LOCK must be acquired PRIOR to calling this (not necessary for post instances)!
      mw.req().set('instance', instanceKey),
      mw.req().set('container', oldContainerKey),
      mw.req().set('instanceName', instanceNameKey),
      mw.req().set('ownerUsername', ownerUsernameKey),
      mw.req('container.dockerContainer').require()
        .then( // has a docker container
          // delete old hosts - don't background it - important to ensure it is locked
          sauron.create('container.dockerHost'),
          sauron.model.detachHostFromContainer(
            'instance.network.networkIp',
            'instance.network.hostIp',
            'container.dockerContainer'),
          hosts.model.removeHostsForInstance(
            'ownerUsername', 'instance', 'instanceName', 'container'),
          function (req, res, next) { // BACKGROUND remove - sauron and docker
            flow.series(
              // remove from docker, AFTER sauron detachment
              docker.create('container.dockerHost'),
              // stopContainer with true means: ignore already stopped error
              userStoppedContainer.create('container.dockerContainer'),
              userStoppedContainer.model.lock(),
              docker.model.stopContainer('container', true),
              docker.model.removeContainer('container'),
              userStoppedContainer.model.unlock()
            )(req, res, error.logIfErr);
            // NEXT, to 'background' tasks
            next();
          }));
  };

/** Get's the list of instances to be displayed to the user.  This should contain all of the
 *  instances owned by the owner, as well as those owned by groups (s)he is part of
 *  @event GET rest/instances
 *  @memberof module:rest/instances */
app.get('/instances/',
  mw.query({or: ['owner.github', 'githubUsername', '["owner.github"]']}).require(),
  timers.create(),
  timers.model.startTimer('githubUsername_check'),
  mw.query('githubUsername').require()
    .then(
      github.create(),
      github.model.getUserByUsername('query.githubUsername'),
      mw.query().set('owner.github', 'githubResult.id')),
  timers.model.stopTimer('githubUsername_check'),
  mw.query({or: [
    'owner', 'shortHash', 'name', '["contextVersion.appCodeVersions.repo"]'
  ]}).require(),
  // Note: be careful pick does not work like the others,
  // pick only works with keys and not keypaths!
  mw.query('owner', 'shortHash', 'name' ,
    'owner.github', 'contextVersion.appCodeVersions.repo').pick(),
  mw.query('["contextVersion.appCodeVersions.repo"]').require()
    .then(
      mw.query('["contextVersion.appCodeVersions.repo"]').string(),
      mw.query().set(
        '["contextVersion.appCodeVersions.lowerRepo"]',
        'query["contextVersion.appCodeVersions.repo"].toLowerCase()'),
      mw.query().unset('["contextVersion.appCodeVersions.repo"]')
    ),
  mw.query('owner.github').mapValues(transformations.toInt).number(),
  flow.or(
    me.isOwnerOf('query'),
    ownerIsHelloRunnable('query')
  ),
  instances.find('query'),
  timers.model.startTimer('populateOwnerAndCreatedByForInstances'),
  instances.populateOwnerAndCreatedByForInstances('sessionUser', 'instances'),
  timers.model.stopTimer('populateOwnerAndCreatedByForInstances'),
  timers.model.startTimer('instance-route.populateModels'),
  instances.models.populateModels(),
  timers.model.stopTimer('instance-route.populateModels'),
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
      mw.body('owner.github').number(),
      mw.req('isInternalRequest').require() // skip owner check if internal
        .else(me.isOwnerOf('body'))),
  bodyValidations,
  // default values for owner.github if not provided - must happen after validations!
  mw.body('owner.github').require()
    .else(
      mw.body().set('owner', 'build.owner')),
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
  findBuildContextVersion,
  // without toJSON - mongoose inf loops.
  mw.body().set('contextVersion', 'contextVersion.toJSON()'),
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
        // deploy build if it is built
        runnable.create({}, 'sessionUser'),
        runnable.model.deployInstance('instance', { json: { build: 'build._id.toString()' } }),
        messenger.emitInstanceUpdate('instance', 'post'),
        mw.res.send(201, 'runnableResult'),
        function () {}))
  .catch( // dealloc networkIp/hostIp
    mw.req().setToErr('err'),
    flow.try(
      sauron.model.deleteHost('networkInfo.networkIp', 'networkInfo.hostIp'))
    .catch(
      error.logIfErrMw),
    mw.next('err') // next error
  ),
  instances.model.populateOwnerAndCreatedBy('sessionUser'),
  instances.model.populateModels(),
  messenger.emitInstanceUpdate('instance', 'post'),
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
  instances.model.populateOwnerAndCreatedBy('sessionUser'),
  instances.model.populateModels(),
  mw.res.json('instance'));


/**
 * Polling route used by frontend to determine if a new build was pushed
 *  @event GET rest/instances/:id/containers
 *  @memberof module:rest/instances/:id/containers */
app.get('/instances/:id/build',
  findInstance,
  flow.or(
    me.isOwnerOf('instance'),
    me.isModerator),
  mw.res.json('instance.build')); // buildId as string

/**
 * acquire host locks for oldName and newName
 */
var acquireOldAndNewHostLocks = flow.series(
  hosts.create(),
  hosts.model.acquireHostLock('ownerUsername', 'newName'),
  flow.try(
    hosts.model.acquireHostLock('ownerUsername', 'oldName'))
  .catch(
    mw.req().setToErr('err'),
    hosts.model.releaseHostLock('ownerUsername', 'newName'),
    mw.next('err')));

/**
 * release host locks for oldName and newName
 */
var releaseOldAndNewHostLocks = flow.parallel(
  hosts.model.releaseHostLock('ownerUsername', 'oldName'),
  hosts.model.releaseHostLock('ownerUsername', 'newName'));

/**
 * deploy successful build to container
 */
var updateInstanceBuild = flow.series(
  // get owner username
  mw.req().set('user', 'sessionUser'),
  users.model.findGithubUserByGithubId('instance.owner.github'),
  checkFound('user', 'Owner not found'),
  mw.req().set('ownerUsername', 'user.login'),
  // acquire locks
  hosts.create(),
  mw.body('name').require()
    .then(
      mw.req().set('oldName', 'instance.name'),
      mw.req().set('newName', 'body.name'),
      acquireOldAndNewHostLocks)
    .else(
      // new name and old name are the same here!!
      mw.req().set('oldName', 'instance.name'),
      mw.req().set('newName', 'instance.name'),
      hosts.model.acquireHostLock('ownerUsername', 'oldName')),
  flow.try(
    // cache old container so old hipache routes can be removeds
    mw.req().set('oldContainer', 'instance.container'),
    // UPDATE INSTANCE with BODY - FIRST to ensure there is no conflict (name)
    instances.model.update({ $set: 'body', $unset: { container: 1 } }),
    instances.findById('instanceId'),
    // remove old container
    removeInstanceContainer(
      'instance', 'oldContainer', 'oldName', 'ownerUsername'),
    // create container if build is successful
    mw.req('build.successful').validate(validations.equals(true))
      .then(
        createSaveAndNetworkContainer))
  .catch(
    mw.req().setToErr('err'),
    // release locsk if error occurred
    flow.try(
      mw.body('name').require()
        .then(
          releaseOldAndNewHostLocks)
        .else(
          hosts.model.releaseHostLock('ownerUsername', 'oldName')))
    .catch(
      error.logIfErrMw),
    mw.next('err')),
  // release locks
  // release locsk if error occurred
  mw.body('name').require()
    .then(
      releaseOldAndNewHostLocks)
    .else(
      hosts.model.releaseHostLock('ownerUsername', 'oldName')));

/**
 * update hosts for container (dns, hipache)
 */
var updateInstanceName = flow.series(
  // IMPORTANT - cache names before update
  mw.req().set('oldName', 'instance.name'),
  mw.req().set('newName', 'body.name'),
  // UPDATE INSTANCE with BODY - FIRST to ensure there is no conflict (name)
  instances.model.update({ $set: 'body' }),
  instances.findById('instanceId'),
  // get owner username
  mw.req().set('user', 'sessionUser'),
  users.model.findGithubUserByGithubId('instance.owner.github'),
  checkFound('user', 'Owner not found'),
  mw.req().set('ownerUsername', 'user.login'),
  // acquire locks
  acquireOldAndNewHostLocks,
  flow.try(
    // upsert new hosts
    hosts.model.upsertHostsForInstance('ownerUsername', 'instance', 'newName'),
    // remove old hosts - LAST least important
    hosts.model.removeHostsForInstance('ownerUsername', 'instance', 'oldName'))
  .catch(
    mw.req().setToErr('err'),
    // release locks if error occurred
    flow.try(
      releaseOldAndNewHostLocks)
    .catch(
      error.logIfErrMw),
    mw.next('err')
  ),
  // release locks
  releaseOldAndNewHostLocks);

var releaseLocks = flow.series(
  hosts.model.releaseHostLock('ownerUsername', 'instance.name'),
  mw.req('oldName.toLowerCase()')
    .require()
    .validate(validations.notEqualsKeypath('instance.name.toLowerCase()'))
    .then(
      hosts.model.releaseHostLock('ownerUsername', 'oldName'))
);

/** Route for redeploying an instance with a new build.  This route should first
 *  @event PATCH rest/instances/:id
 *  @memberof module:rest/instances */
app.patch('/instances/:id',
  findInstance,
  mw.req().set('origInstance', 'instance'),
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
  mw.body({ or: ['public', 'name', 'build', 'env', 'locked']}).require().pick(),
  bodyValidations,
  mw.body({ or: ['build', 'name'] }).require()
    .then(
      mw.body('build').require()
        .then( // build (and maybe name) was updated
          findBuildContextVersion,
          // without toJSON - mongoose inf loops.
          mw.body().set('contextVersion', 'contextVersion.toJSON()'),
          updateInstanceBuild)
        .else( // name was updated
          updateInstanceName))
    .else(
      // UPDATE INSTANCE with BODY - no name or build changes just update mongo
      instances.model.update({ $set: 'body' }),
      instances.findById('instanceId')),
  instances.findById('instanceId'),
  instances.model.populateOwnerAndCreatedBy('sessionUser'),
  mw.body({ or: ['name', 'env'] }).require()
    .then(
      // acquire lock
      mw.req().set('ownerUsername', 'instance.owner.username'),
      hosts.create(),
      hosts.model.acquireHostLock('ownerUsername', 'instance.name'),
      flow.try(
        mw.req('oldName.toLowerCase()')
          .require()
          .validate(validations.notEqualsKeypath('instance.name.toLowerCase()'))
          .then(
            hosts.model.acquireHostLock('ownerUsername', 'oldName'))
      ).catch(
        mw.req().setToErr('err'),
        hosts.model.releaseHostLock('ownerUsername', 'instance.name'),
        mw.next('err')
      ),
      flow.try(
        graph.create(),
        mw.body('name').require()
          .then(
            // oldName is set in 'updateInstanceName'
            graph.model.graphInstanceDeps('instance', 'oldName'))
          .else(
            graph.model.graphInstanceDeps('instance'))
      ).catch(
        mw.req().setToErr('err'),
        releaseLocks,
        mw.next('err')
      ),
      releaseLocks
    ),
  instances.model.populateModels(),
  messenger.emitInstanceUpdate('instance', 'patch'),
  resSendAndNext(200, 'instance'),
  // handle pr comment in bg
  mw.body('build').require()
    .then(
      githubNotifications.create(),
      githubNotifications.model.updatePullRequestsComments('instance', 'origInstance')),
  noop);


/** Delete in a instance
 *  @event DELETE rest/instances/:id
 *  @memberof module:rest/instances */
app.delete('/instances/:id',
  findInstance,
  flow.or(
    me.isOwnerOf('instance'),
    me.isModerator),
  // get owner username
  mw.req().set('user', 'sessionUser'),
  users.model.findGithubUserByGithubId('instance.owner.github'),
  checkFound('user', 'Owner not found'),
  mw.req().set('ownerUsername', 'user.login'),
  // acquire lock
  hosts.create(),
  hosts.model.acquireHostLock('ownerUsername', 'instance.name'),
  flow.try(
    // cache before delete
    mw.req().set('deletedInstance', 'instance'),
    // remove instance
    instances.removeById('instanceId'),
    // remove instance container
    removeInstanceContainer(
      'deletedInstance', 'deletedInstance.container', 'deletedInstance.name', 'ownerUsername'))
  .catch(
    mw.req().setToErr('err'),
    hosts.model.releaseHostLock('ownerUsername', 'deletedInstance.name'),
    mw.next('err')),
  // release lock
  hosts.model.releaseHostLock('ownerUsername', 'deletedInstance.name'),
  messenger.emitInstanceUpdate('instance', 'delete'),
  // TODO: if deleting last instance for an org we can delete the network
  // beware of race with create
  resSendAndNext(204),
  // update github prs' comments ib background
  mw.req().set('instance.owner', 'user'),
  githubNotifications.create(),
  githubNotifications.model.updatePullRequestsComments('instance', null),
  noop);

/**
 * Fork should deep copy an instance, as well as deep copy its current build.  We don't want
 * to shallow copy because it could lead to a rebuild of one instance rebuilding multiple ones.
 *
 * @params id: of the instance to fork
 * @body owner: Either this user, or their associated org
 */
app.post('/instances/:id/actions/copy',
  findInstance,
  flow.or(
    me.isOwnerOf('instance'),
    ownerIsHelloRunnable('instance'),
    me.isModerator),
  mw.body('owner.github').require().then(
    mw.body('owner.github').number(),
    flow.or(
      me.isOwnerOf('body'),
      ownerIsHelloRunnable('body')
    )),
  // The best way to clone an instance is to just use the post route
  // If we deep copy the build, we can attach its id to the body, and just use the post route
  findBuild,
  mw.body('name', 'env', 'owner').pick(),
  mw.body('name').require().then(mw.body('name').string()),
  runnable.create({}, 'sessionUser'),
  // Now that the copied build is in the runnableResult, we can send it to the createInstance route
  runnable.model.copyInstance('sessionUser', 'build', 'instance', 'body'),
  // Now return the new instance

  resSendAndNext(201, 'runnableResult'),
  githubNotifications.create(),
  githubNotifications.model.updatePullRequestsComments('runnableResult', 'instance'),
  noop);

/** Creates a container (instance.container) from the current instance build (instance.build)
 *  @event PUT rest/instances/:id
 *  @event POST rest/instances/:id/actions/deploy
 *  @params id: instance id
 */
app.post('/instances/:id/actions/deploy',
  isInternalRequest,
  findInstance,
  flow.or(
    me.isOwnerOf('instance'),
    me.isModerator),
  findBuild,
  mw.body('build').require()
    .then(
      mw.body('build.toString()').validate(validations.equalsKeypath('instance.build.toString()'))
        .else(
          mw.next(Boom.badRequest('Deploy build does not match instance')))),
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
    // happens in patch instance w/ build AND here
    // update context version
    findBuildContextVersion,
    // without toJSON - mongoose inf loops.
    instances.model.update({ $set: { contextVersion: 'contextVersion.toJSON()' } }),
    instances.findById('instanceId'),
    // create container
    createSaveAndNetworkContainer,
    graph.create(),
    instances.model.populateOwnerAndCreatedBy('sessionUser'),
    graph.model.graphInstanceDeps('instance'))
  .catch(
    mw.req().setToErr('err'),
    // release lock if error occurred
    hosts.model.releaseHostLock('ownerUsername', 'instance.name'),
    mw.next('err')),
  // release lock
  hosts.model.releaseHostLock('ownerUsername', 'instance.name'),
  instances.model.populateModels(),
  mw.req().set('instance.owner.username', 'ownerUsername'),
  messenger.emitInstanceUpdate('instance', 'deploy'),
  mw.res.json('instance'));

/** Creates a container (instance.container) from the current instance build (instance.build)
 *  @event PUT rest/instances/:id
 *  @event POST rest/instances/:id/actions/redeploy
 *  @params id: instance id
 */
app.post('/instances/:id/actions/redeploy',
  findInstance,
  flow.or(
    me.isOwnerOf('instance'),
    me.isModerator),
  findBuild,
  mw.body('build').require()
    .then(
      mw.body('build.toString()').validate(validations.equalsKeypath('instance.build.toString()'))
        .else(
          mw.next(Boom.badRequest('Redeploy build does not match instance')))),
  mw.req('build.successful').validate(validations.equals(true))
    .else(mw.next(Boom.badRequest('Cannot redeploy an instance with an unsuccessful build'))),
  mw.req('instance.container').require()
    .else(mw.next(Boom.badRequest('Cannot redeploy an instance without a container'))),
  // get owner username
  mw.req().set('user', 'sessionUser'),
  users.model.findGithubUserByGithubId('instance.owner.github'),
  checkFound('user', 'Owner not found'),
  mw.req().set('ownerUsername', 'user.login'),
  // acquire lock
  hosts.create(),
  hosts.model.acquireHostLock('ownerUsername', 'instance.name'),
  flow.try(
    // happens in patch instance w/ build AND here
    // update context version
    findBuildContextVersion,
    // without toJSON - mongoose inf loops.
    instances.model.update({ $set: { contextVersion: 'contextVersion.toJSON()' } }),
    instances.findById('instanceId'),
    // cache old container so old hipache routes can be removeds
    mw.req().set('oldContainer', 'instance.container'),
    // UPDATE INSTANCE with BODY - FIRST to ensure there is no conflict (name)
    instances.model.update({ $unset: { container: 1 } }),
    instances.findById('instanceId'),
    // remove old container
    removeInstanceContainer(
      'instance', 'oldContainer', 'instance.name', 'ownerUsername'),
    // create container
    createSaveAndNetworkContainer,
    graph.create(),
    instances.model.populateOwnerAndCreatedBy('sessionUser'),
    graph.model.graphInstanceDeps('instance'))
  .catch(
    mw.req().setToErr('err'),
    // release lock if error occurred
    hosts.model.releaseHostLock('ownerUsername', 'instance.name'),
    mw.next('err')),
  // release lock
  hosts.model.releaseHostLock('ownerUsername', 'instance.name'),
  instances.model.populateModels(),
  mw.req().set('instance.owner.username', 'ownerUsername'),
  messenger.emitInstanceUpdate('instance', 'redeploy'),
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
    mw.req().set('dockerHost', 'instance.container.dockerHost'),
    docker.create('dockerHost'),
    docker.model.startUserContainer('instance.container'),
    instances.model.inspectAndUpdate(),
    // update weave
    sauron.create('instance.container.dockerHost'),
    sauron.model.attachHostToContainer(
      'instance.network.networkIp',
      'instance.network.hostIp',
      'instance.container.dockerContainer'),
    // upsert new hosts (overwrites old ones)
    hosts.model.upsertHostsForInstance('ownerUsername', 'instance'))
  .catch(
    mw.req().setToErr('err'),
    // release lock if error occurred
    hosts.model.releaseHostLock('ownerUsername', 'instance.name'),
    mw.next('err')),
  // success!
  hosts.model.releaseHostLock('ownerUsername', 'instance.name'),
  instances.model.populateModels(),
  mw.req().set('instance.owner.username', 'ownerUsername'),
  messenger.emitInstanceUpdate('instance', 'start'),
  mw.res.json('instance'));

/** Restart instance container
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
    // start container
    mw.req().set('dockerHost', 'instance.container.dockerHost'),
    docker.create('dockerHost'),
    // ignore next die
    userStoppedContainer.create('instance.container.dockerContainer'),
    userStoppedContainer.model.lock(),
    flow.try(
      docker.model.restartContainer('instance.container')
    ).catch(
      mw.req().setToErr('restartErr'),
      // don't ignore next die
      userStoppedContainer.model.unlock(),
      mw.next('restartErr')
    ),
    instances.model.inspectAndUpdate(),
    // update weave
    sauron.create('instance.container.dockerHost'),
    sauron.model.attachHostToContainer(
      'instance.network.networkIp',
      'instance.network.hostIp',
      'instance.container.dockerContainer'),
    // upsert new hosts (overwrites old ones)
    hosts.model.upsertHostsForInstance('ownerUsername', 'instance'))
  .catch(
    mw.req().setToErr('err'),
    // release lock if error occurred
    hosts.model.releaseHostLock('ownerUsername', 'instance.name'),
    mw.next('err')),
  // success!
  hosts.model.releaseHostLock('ownerUsername', 'instance.name'),
  instances.model.populateModels(),
  mw.req().set('instance.owner.username', 'ownerUsername'),
  messenger.emitInstanceUpdate('instance', 'restart'),
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
    mw.req().set('dockerHost', 'instance.container.dockerHost'),
    // update weave while container is potentially running
    sauron.create('dockerHost'),
    sauron.model.detachHostFromContainer(
      'instance.network.networkIp',
      'instance.network.hostIp',
      'instance.container.dockerContainer'),
    // delete host entries
    hosts.model.removeHostsForInstance('ownerUsername', 'instance'),
    // stop container
    docker.create('dockerHost'),
    mw.body('force').mapValues(transformations.setDefault(false)),
    // ignore next die
    userStoppedContainer.create('instance.container.dockerContainer'),
    userStoppedContainer.model.lock(),
    flow.try(
      docker.model.stopContainer('instance.container', 'body.force'),
      instances.model.inspectAndUpdate()
    ).catch(
      mw.req().setToErr('restartErr'),
      // don't ignore next die
      userStoppedContainer.model.unlock(),
      mw.next('restartErr')
    ))
  .catch(
    mw.req().setToErr('err'),
    // release lock if error occurred
    hosts.model.releaseHostLock('ownerUsername', 'instance.name'),
    mw.next('err')),
  hosts.model.releaseHostLock('ownerUsername', 'instance.name'),
  instances.model.populateModels(),
  mw.req().set('instance.owner.username', 'ownerUsername'),
  messenger.emitInstanceUpdate('instance',  'stop'),
  mw.res.json('instance'));

/** Re-graph deps
 *  @event POST rest/instances/:id/actions/regraph
 *  @memberof module:rest/instances */
app.post('/instances/:id/actions/regraph',
  findInstance,
  flow.or(
    me.isOwnerOf('instance'),
    me.isModerator),
  mw.req().set('user', 'sessionUser'),
  users.model.findGithubUserByGithubId('instance.owner.github'),
  checkFound('user', 'Owner not found'),
  mw.req().set('ownerUsername', 'user.login'),
  graph.create(),
  instances.model.populateOwnerAndCreatedBy('sessionUser'),
  graph.model.graphInstanceDeps('instance'),
  instances.model.populateModels(),
  mw.req().set('instance.owner.username', 'ownerUsername'),
  mw.res.json('instance'));
