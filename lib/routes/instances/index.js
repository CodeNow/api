/**
 * route handlers defined in this module:
 * GET /instances
 * POST /instances
 * GET /instances/:id
 * GET /instances/:id/build
 * POST /instances/:id/actions/copy
 * DELETE /instances/:id
 * PATCH /instances/:id
 * POST /instances/:id/actions/deploy
 * POST /instances/:id/actions/redeploy
 * PUT /instances/:id/actions/start
 * PUT /instances/:id/actions/restart
 * PUT /instances/:id/actions/stop
 * @module lib/routes/instances/index
 */
'use strict';

var express = require('express');
var app = module.exports = express();
var flow = require('middleware-flow');
var mw = require('dat-middleware');

var checkFound = require('middlewares/check-found');
var docker = require('middlewares/apis').docker;
var error = require('error');
var github = require('middlewares/apis').github;
var hosts = require('middlewares/redis').hosts;
var isInternalRequest = require('middlewares/is-internal-request');
var mavis = require('middlewares/apis').mavis;
var me = require('middlewares/me');
var messenger = require('middlewares/socket').messenger;
var mongoMiddlewares = require('middlewares/mongo');
var ownerIsHelloRunnable = require('middlewares/owner-is-hello-runnable');
var runnable = require('middlewares/apis').runnable;
var sauron = require('middlewares/apis').sauron;
var timers = require('middlewares/apis').timers;
var transformations = require('middlewares/transformations');
var userStoppedContainer = require('middlewares/redis').userStoppedContainer;
var validations = require('middlewares/validations');

var Boom = mw.Boom;
var builds = mongoMiddlewares.builds;
var contextVersions = mongoMiddlewares.contextVersions;
var instanceCounter = mongoMiddlewares.instanceCounters;
var instances = mongoMiddlewares.instances;
var users = mongoMiddlewares.users;

var findInstance = flow.series(
  instances.findOneByShortHash('params.id'),
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
  docker.create('dockerHost'),
  flow.background( // background container create task
    flow.try(
      docker.model.createUserContainer('contextVersion', {
        Env: 'instance.env',
        Labels: {
          instanceId: 'instance._id.toString()',
          contextVersionId: 'contextVersion._id.toString()',
          ownerUsername: 'ownerUsername',
          instanceName: 'instance.name.toString()'
        }
      }))
      // docker event listener handler will handle success case
    .catch(
      mw.req().setToErr('containerCreateErr'),
      mw.req('containerCreateErr.output.statusCode').validate(validations.equals(504))
        .then(
          // log err. TODO: let chronos mark it with a timeout error if it never completes
          error.logKeypathMw('containerCreateErr')
        )
        .else(
          // recieved a real error mark the container as errored.
          instances.model.modifyContainerCreateErr('contextVersion._id', 'containerCreateErr'),
          // note: below logic is for future when container creates are dock-balanced
          mw.req('containerCreateErr.output.statusCode').validate(validations.equals(404))
            .then(
              docker.model.pullImage('contextVersion'),
              messenger.emitImagePulling('instance', 'dockerResult'),
              function(req, res) {
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
              })
        )
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
  mw.query('hostname').require()
    .then(
      mw.query('hostname').string(),
      hosts.create(),
      flow.try(
        hosts.model.parseHostname('query.hostname')
      ).catch(
        mw.req().setToErr('err'),
        mw.req('err.output.statusCode')
          .require().validate(validations.equals(404))
          .then(
            mw.req().set('emptyArr', []),
            mw.res.json('emptyArr')
          )
          .else(
            mw.next('err')
          )
      ),
      mw.query().set('githubUsername', 'hostsResult.username'),
      mw.query().set('name', 'hostsResult.instanceName'),
      mw.query().unset('hostname')
    ),
  mw.query({ or: ['owner.github', 'githubUsername', '["owner.github"]'] }).require(),
  timers.create(),
  timers.model.startTimer('githubUsername_check'),
  mw.query('githubUsername').require()
    .then(
      github.create(),
      github.model.getUserByUsername('query.githubUsername'),
      mw.query().set('owner.github', 'githubResult.id')),
  timers.model.stopTimer('githubUsername_check'),
  mw.query({or: [
    'owner', 'shortHash', 'name', '["contextVersion.appCodeVersions.repo"]',
    '["network.hostIp"]', 'masterPod', '["contextVersion.context"]'
  ]}).require(),
  // Note: be careful pick does not work like the others,
  // pick only works with keys and not keypaths!
  mw.query('owner', 'shortHash', 'name' ,
    'owner.github', 'contextVersion.appCodeVersions.repo',
    'network.hostIp', 'masterPod', 'contextVersion.context'
  ).pick(),
  mw.query('name').require().then(
    mw.query('name').string(),
    mw.query().set('lowerName', 'query.name.toLowerCase()'),
    mw.query().unset('name')
  ),
  mw.query('["contextVersion.context"]').require()
    .then(
      mw.query('["contextVersion.context"]')
        .validate(validations.isObjectId)
        .mapValues(transformations.toObjectId)),
  mw.query('["contextVersion.appCodeVersions.repo"]').require()
    .then(
      mw.query('["contextVersion.appCodeVersions.repo"]').string(),
      mw.query().set(
        '["contextVersion.appCodeVersions.lowerRepo"]',
        'query["contextVersion.appCodeVersions.repo"].toLowerCase()'),
      mw.query().unset('["contextVersion.appCodeVersions.repo"]')
    ),
  // Normalize the owner.github key in the query parameters
  // (since we can take both the flat keypath and nested keys)
  mw.query('owner.github').require()
    .then(
      mw.query().set('["owner.github"]', 'query.owner.github'),
      mw.query().unset('owner')
    ),
  // Only transform github owner id to an integer and check permissions
  // if we have a github owner in the params (this will not be the case
  // when requests are being performed by moderators).
  mw.query('["owner.github"]').require()
    .then(
      mw.query('["owner.github"]').mapValues(transformations.toInt).number(),
      flow.or(
        me.isOwnerOf({
          owner: {
            github: 'query["owner.github"]'
          }
        }),
        ownerIsHelloRunnable({
          owner: {
            github: 'query["owner.github"]'
          }
        }),
        me.isModerator
      )),
  instances.find('query'),
  timers.model.startTimer('populateOwnerAndCreatedByForInstances'),
  instances.populateOwnerAndCreatedByForInstances('sessionUser', 'instances'),
  timers.model.stopTimer('populateOwnerAndCreatedByForInstances'),
  timers.model.startTimer('instance-route.populateModels'),
  instances.models.populateModels(),
  timers.model.stopTimer('instance-route.populateModels'),
  mw.res.json('instances'));

/**
 *  Creates a new instance for the provided build.
 *  @param body.build - Id of the Build to build an instance off of
 *  @param body.name - name of the instance
 *  @param body.parent - id of the parent instance
 *  @event POST rest/instances
 *  @memberof module:rest/instances */
app.post('/instances/',
  mw.body('build').require().validate(validations.isObjectId),
  mw.body('name', 'owner', 'env', 'parent', 'build', 'autoForked').pick(),
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
  instances.model.upsertIntoGraph(),
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
        // deployInstance - internal request: POST /instances/:id/actions/deploy
        runnable.model.deployInstance('instance', { json: { build: 'build._id.toString()' } }),
        instances.model.populateOwnerAndCreatedBy('sessionUser'),
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
  mw.body({or: [ 'public', 'name', 'build', 'env', 'locked', 'container' ]}).require().pick(),
  bodyValidations,
  mw.body('container').require()
    .then(
      mw.body('container.dockerHost', 'container.dockerContainer').require(),
      mw.body('container.dockerHost').matches(validations.isDockerHost),
      mw.query('contextVersion').pick().require()
        .else(
          mw.next(mw.Boom.badRequest('query.contextVersion is required when updating container'))),
      instances.model.findSelf('query'),
      mw.req('instance').require()
        .else(
          mw.next(mw.Boom.conflict('instances\'s contextVersion does match query')))
    ),
  mw.body({or: ['build', 'name']}).require()
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
  instances.model.upsertIntoGraph(),
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
      releaseLocks
    ),
  instances.model.populateModels(),
  messenger.emitInstanceUpdate('instance', 'patch'),
  mw.res.json('instance'));

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
  instances.model.populateOwnerAndCreatedBy('sessionUser'),
  messenger.emitInstanceUpdate('deletedInstance', 'delete'),
  // TODO: if deleting last instance for an org we can delete the network
  // beware of race with create
  mw.res.status(204),
  mw.res.end());

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
  mw.res.status(201),
  mw.res.json('runnableResult')
);

/**
 *  Creates a container (instance.container) from the current instance build
 *  (instance.build)
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
    instances.model.populateOwnerAndCreatedBy('sessionUser'))
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
    instances.model.populateOwnerAndCreatedBy('sessionUser'))
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

    // this will become fire+forget and all below operations
    // will be performed in worker process
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
  instances.model.populateOwnerAndCreatedBy('sessionUser'),
  instances.model.populateModels(),
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
  instances.model.populateOwnerAndCreatedBy('sessionUser'),
  instances.model.populateModels(),
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
  instances.model.populateOwnerAndCreatedBy('sessionUser'),
  instances.model.populateModels(),
  messenger.emitInstanceUpdate('instance',  'stop'),
  mw.res.json('instance'));
