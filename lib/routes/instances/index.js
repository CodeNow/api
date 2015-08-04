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
var flow = require('middleware-flow');
var keypather = require('keypather')();
var mw = require('dat-middleware');

var checkFound = require('middlewares/check-found');
var docker = require('middlewares/apis').docker;
var error = require('error');
var github = require('middlewares/apis').github;
var hosts = require('middlewares/redis').hosts;
var isInternalRequest = require('middlewares/is-internal-request');
var keypather = require('keypather')();
var logger = require('middlewares/logger')(__filename);
var mavis = require('middlewares/apis').mavis;
var me = require('middlewares/me');
var messenger = require('middlewares/socket').messenger;
var mongoMiddlewares = require('middlewares/mongo');
var ownerIsHelloRunnable = require('middlewares/owner-is-hello-runnable');
var rabbitMQ = require('models/rabbitmq');
var requestTrace = require('middlewares/request-trace');
var runnable = require('middlewares/apis').runnable;
var sauron = require('middlewares/apis').sauron;
var timers = require('middlewares/apis').timers;
var transformations = require('middlewares/transformations');
var userStoppedContainer = require('middlewares/redis').userStoppedContainer;
var validations = require('middlewares/validations');

var Boom = mw.Boom;
var builds = mongoMiddlewares.builds;
var contextVersions = mongoMiddlewares.contextVersions;
var contexts = mongoMiddlewares.contexts;
var instanceCounter = mongoMiddlewares.instanceCounters;
var instances = mongoMiddlewares.instances;
var users = mongoMiddlewares.users;

var app = module.exports = express();

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
        'Cannot attach a build to an instance with context ' +
        'versions that have not started building'))));

var findContextVersionContext = flow.series(
  contexts.findById('contextVersion.context'),
  checkFound('context'));

/**
 * Body param validations for post and patch instance (name, env, build)
 * @param {String} body.name   name to set on the instance
 * @param {String} body.build  id of the build to be attached to the instance
 * @param {Array}  body.env    environment variables to set on the instance
 */
var bodyValidations = flow.series(
  mw.body('name').require().then(
    // If name is being changed, we should attempt
    mw.body('name').string().matches(/^[-0-9a-zA-Z]+$/), // alpha-num schema validator
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
        mw.req('env').matches(/^([A-z]+[A-z0-9_]*)=.*$/))),
  mw.body('public').require()
    .then(mw.body('public').boolean()),
  mw.body('locked').require()
    .then(mw.body('locked').boolean()),
  mw.body('masterPod').require()
    .then(mw.body('masterPod').boolean()),
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
var createContainer = flow.series(
  findBuildContextVersion,
  findContextVersionContext,
  mw.req('body.forceDock').require()
    .then(
      mw.req().set('dockerHost', 'body.forceDock'))
    .else(
      mavis.create(),
      mavis.model.findDockForContainer('contextVersion', 'context'),
      mw.req().set('dockerHost', 'mavisResult')),
  docker.create('dockerHost'),
  flow.background( // background container create task
    flow.try(
      docker.model.transferImage('contextVersion.build.dockerTag',
        'contextVersion.dockerHost'),
      // mongoose is stupid:
      // mongoose properties are not normal objects/types:
      //  * ObjectIds are not strings.
      //  * Array properties are not actually arrays.
      // Make sure everything is a native type before
      // passing it to createUserContainer
      // since this is in background, something in foreground can toJSON() instance
      function (req, res, next) {
        req.instanceEnvs = req.instance.env;
        if (req.instance.toJSON) {
          req.instanceEnvs = req.instance.toJSON().env;
        }
        req.instanceEnvs.push('RUNNABLE_BRANCH_ID=' + req.instance.shortHash);
        next();
      },
      docker.model.createUserContainer('contextVersion', {
        Env: 'instanceEnvs',
        Labels: {
          contextVersionId : 'contextVersion._id.toString()',
          instanceId       : 'instance._id.toString()',
          instanceName     : 'instance.name.toString()',
          instanceShortHash: 'instance.shortHash.toString()',
          ownerUsername    : 'ownerUsername',
          creatorGithubId  : 'instance.createdBy.github.toString()',
          ownerGithubId    : 'instance.owner.github.toString()'
        }
      }))
      // docker event listener handler will handle success case
    .catch(
      mw.req().setToErr('containerCreateErr'),
      mw.req('containerCreateErr.output.statusCode').validate(validations.equals(504))
        .then(
          // container create timed out.
          // log err. TODO: let chronos mark it with a timeout error if it never completes
          error.logKeypathMw('containerCreateErr')
        )
        .else(
          // container create errored, NOT a timeout error
          // we must handle this error here.
          // The worker will never recieve this error; the container was not created at all.
          instances.model.modifyContainerCreateErr('contextVersion._id', 'containerCreateErr')
        )
      )
    )
  );

/**
 *  Remove instance container
 *  @param {String} instanceKey      instance key on req
 *  @param {String} oldContainerKey  instance's old container key on req
 *  @param {String} instanceNameKey  instance's name (in hosts to remove) key on req
 *  @param {String} ownerUsernameKey instance's owner's username key on req
 *  // also assumes req.instance exists
 * */
var removeInstanceContainer = // TODO: this has a lot of overlap with instance stop
  function (instanceKey, oldContainerKey, instanceNameKey, ownerUsernameKey) {
    return flow.series(
      mw.req().set('instance', instanceKey),
      mw.req().set('container', oldContainerKey),
      mw.req().set('instanceName', instanceNameKey),
      mw.req().set('ownerUsername', ownerUsernameKey),
      mw.req('container.dockerContainer').require()
        .then( // has a docker container
          // delete old hosts - don't background it
          sauron.create('container.dockerHost'),
          sauron.model.detachHostFromContainer(
            'instance.network.networkIp',
            'instance.network.hostIp',
            'container.dockerContainer'),
          hosts.create(),
          hosts.model.removeHostsForInstance(
            'ownerUsername', 'instance', 'instanceName', 'container'),
          flow.background(
            // remove from docker, AFTER sauron detachment
            docker.create('container.dockerHost'),
            // stopContainer with true means: ignore already stopped error
            userStoppedContainer.create('container.dockerContainer'),
            userStoppedContainer.model.lock(),
            docker.model.stopContainer('container', true),
            docker.model.removeContainer('container'),
            userStoppedContainer.model.unlock()
          )
        ));
  };

/**
 * Deploy successful build to container
 * @param {String} body.instance       name to set on the instance
 * @param {String} body.build          id of the build to be attached to the instance
 * @param {Array}  body.contextVersion environment variables to set on the instance
 * @param {Array}  body.*              any other instance schema updates
 */
var updateInstanceBuild = flow.series(
 // cache old container so old hipache routes can be removeds
 // get owner username
  mw.req().set('user', 'sessionUser'),
  users.model.findGithubUserByGithubId('instance.owner.github'),
  checkFound('user', 'Owner not found'),
  mw.req().set('ownerUsername', 'user.login'),
  // cache old container so old hipache routes can be removeds
  mw.req().set('oldContainer', 'instance.container'),
  // UPDATE INSTANCE with BODY - FIRST to ensure there is no conflict (name)
  instances.findByIdAndUpdate('instanceId', {
    $set: 'body',
    $unset: { container: 1 }
  }),
  // remove old container
  removeInstanceContainer(
    'instance', 'oldContainer', 'oldName', 'ownerUsername'),
  // create container if build is successful
  mw.req('build.successful').validate(validations.equals(true))
    .then(
      createContainer)
);


/* Routes Start */


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
  mw.query({ or: [ 'owner.github', 'githubUsername', '["owner.github"]' ] }).require(),
  timers.create(),
  timers.model.startTimer('githubUsername_check'),
  mw.query('githubUsername').require()
    .then(
      github.create(),
      github.model.getUserByUsername('query.githubUsername'),
      mw.query().set('owner.github', 'githubResult.id')),
  timers.model.stopTimer('githubUsername_check'),
  mw.query({ or: [
    'owner', 'shortHash', 'name', '["contextVersion.appCodeVersions.repo"]',
    '["network.hostIp"]', 'masterPod', '["contextVersion.context"]', '_id'
  ] }).require(),
  // Note: be careful pick does not work like the others,
  // pick only works with keys and not keypaths!
  mw.query('owner', 'shortHash', 'name',
    'owner.github', 'contextVersion.appCodeVersions.repo',
    'network.hostIp', 'masterPod', 'contextVersion.context', '_id'
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
  requestTrace('POST_INSTANCES'),
  mw.body('build').require().validate(validations.isObjectId),
  mw.body('name', 'owner', 'env', 'parent', 'build', 'autoForked', 'masterPod').pick(),
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
        req.instanceName = 'Instance' + req.instanceCounter;
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
  instances.model.setDependenciesFromEnvironment('ownerUsername'),
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

/** Route for redeploying an instance with a new build.  This route should first
 *  @event PATCH rest/instances/:id
 *  @memberof module:rest/instances */
app.patch('/instances/:id',
  requestTrace('PATCH_INSTANCES_ID'),
  logger(['body'], 'PATCH_INSTANCES_ID', 'info'),
  findInstance,
  mw.req().set('origInstance', 'instance'),
  flow.or(
    me.isOwnerOf('instance'),
    me.isModerator),
  // Check for non-changes
  mw.body('build').validate(validations.equals('instance.build.toString()'))
    .then(
      mw.body().unset('build')),
  mw.body({
    or: ['public', 'build', 'env', 'locked', 'container', 'masterPod']
  }).require().pick(),
  bodyValidations,
  mw.body('container').require()
    .then(
      mw.body('container.dockerHost', 'container.dockerContainer').require(),
      mw.body('container.dockerHost').validate(validations.isDockerHost),
      mw.query('contextVersion._id').pick(),
      mw.query('["contextVersion._id"]').require()
        .validate(validations.isObjectId)
        .mapValues(transformations.toObjectId)
        .then(
          instances.model.findSelfWithQuery('query'),
          // race condition checking:
          // contextVersion attached to instance may have
          // changed before the request reached this point.
          checkFound('instance',
            'instances\'s contextVersion does match query',
            409)
        )
        .else(
          mw.next(
            mw.Boom.badRequest('query["contextVersion._id"] is required when updating container')))
    ),
  mw.body('build').require()
    .then( // build was updated
      findBuildContextVersion,
      // save lastBuiltSimpleContextVersion if eligible
      mw.req().set('oldContextVersion', 'instance.contextVersion'),
      mw.req('oldContextVersion.advanced').require().validate(validations.equals(false))
        .then(
          mw.req('oldContextVersion.build.completed').require()
            .then(
              function (req, res, next) {
                var oldCvId = keypather.get(req, 'oldContextVersion._id');
                req.body.lastBuiltSimpleContextVersion = {
                  id: oldCvId,
                  created: Date.now()
                };
                next();
              })),
      // without toJSON - mongoose inf loops.
      mw.body().set('contextVersion', 'contextVersion.toJSON()'),
      updateInstanceBuild)
    .else(
      // UPDATE INSTANCE with BODY - no build changes just update mongo
      instances.findByIdAndUpdate('instanceId', { $set: 'body' })),
  instances.findById('instanceId'),
  instances.model.upsertIntoGraph(),
  instances.model.populateOwnerAndCreatedBy('sessionUser'),
  mw.body('env').require().then(
    instances.model.setDependenciesFromEnvironment('instance.owner.username')),
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
  users.model.findGithubUsernameByGithubId('instance.owner.github'),
  checkFound('user', 'Owner not found'),
  mw.req().set('ownerUsername', 'user'),
  // cache before delete
  mw.req().set('deletedInstance', 'instance'),
  instances.model.removeSelfFromGraph(),
  flow.try(
    // remove instance
    instances.removeById('instanceId'),
    // remove instance container
    removeInstanceContainer(
      'deletedInstance', 'deletedInstance.container', 'deletedInstance.name', 'ownerUsername'))
  .catch(
    mw.req().setToErr('err'),
    mw.next('err')),
  messenger.emitInstanceDelete('deletedInstance'),
  // delete all instances that were forked from master instance
  mw.req('deletedInstance.masterPod').validate(validations.equals(true))
    .then(
      runnable.create({}, 'sessionUser'),
      runnable.model.destroyForkedInstances('deletedInstance')),
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
  flow.try(
    // happens in patch instance w/ build AND here
    // update context version
    findBuildContextVersion,
    // without toJSON - mongoose inf loops.
    instances.model.update({ $set: { contextVersion: 'contextVersion.toJSON()' } }),
    instances.findById('instanceId'),
    logger(['instance', 'user', 'build'], 'instance deploy'),
    // create container
    createContainer,
    instances.model.populateOwnerAndCreatedBy('sessionUser'))
  .catch(
    mw.req().setToErr('err'),
    mw.next('err')),
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
    createContainer,
    instances.model.populateOwnerAndCreatedBy('sessionUser'))
  .catch(
    mw.req().setToErr('err'),
    mw.next('err')),
  instances.model.populateModels(),
  mw.req().set('instance.owner.username', 'ownerUsername'),
  messenger.emitInstanceUpdate('instance', 'redeploy'),
  mw.res.json('instance'));

/** Start instance container
 *  @event PUT rest/instances/:id
 *  @memberof module:rest/instances */
app.put('/instances/:id/actions/start',
  requestTrace('PUT_INSTANCES_ID_ACTIONS_START'),
  logger([], 'PUT_INSTANCES_ID_ACTIONS_START', 'info'),
  findInstance,
  flow.or(
    me.isOwnerOf('instance'),
    me.isModerator),
  mw.req('instance.container.dockerContainer').require()
    .else(
      mw.next(Boom.badRequest('Instance does not have a container'))),

  /**
   * Check if instance is starting or stopping.
   * Atomically set to starting
   * return error if state is already start or stopping
   */
  instances.model.isNotStartingOrStopping(),
  function (req, res, next) {
    rabbitMQ.hermesClient.publish('start-instance-container', {
      dockerContainer: req.instance.container.dockerContainer,
      dockerHost: req.instance.container.dockerHost,
      instanceId: req.instance._id,
      ownerGithubId: req.instance.owner.github
    });
    next();
  },
  instances.model.setContainerStateToStarting(),
  checkFound('instance'),

  // get owner username
  mw.req().set('user', 'sessionUser'),
  users.model.findGithubUserByGithubId('instance.owner.github'),
  checkFound('user', 'Owner not found'),
  mw.req().set('ownerUsername', 'user.login'),
  instances.model.populateOwnerAndCreatedBy('sessionUser'),
  messenger.emitInstanceUpdate('instance', 'starting'),


  flow.try(
    // start container
    mw.req().set('dockerHost', 'instance.container.dockerHost'),
    docker.create('dockerHost'),
    // NOTE:
    // Next up for functionality to move into job queue:
    // this will become fire+forget and all below operations
    // will be performed in worker process
    docker.model.startUserContainer('instance.container', 'instance.owner.github'),
    instances.model.inspectAndUpdate(),
    // update weave
    sauron.create('instance.container.dockerHost'),
    sauron.model.attachHostToContainer(
      'instance.network.networkIp',
      'instance.network.hostIp',
      'instance.container.dockerContainer'),
    // upsert new hosts (overwrites old ones)
    hosts.create(),
    hosts.model.upsertHostsForInstance('ownerUsername', 'instance'))
  .catch(
    mw.req().setToErr('err'),
    instances.model.modifyContainerInspectStartStopErr(),
    instances.model.populateOwnerAndCreatedBy('sessionUser'),
    messenger.emitInstanceUpdate('instance', 'start-error'),
    mw.next('err')),
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
  instances.model.isNotStartingOrStopping(),
  instances.model.setContainerStateToStarting(),
  checkFound('instance'),
  // get owner username
  mw.req().set('user', 'sessionUser'),
  users.model.findGithubUserByGithubId('instance.owner.github'),
  checkFound('user', 'Owner not found'),
  mw.req().set('ownerUsername', 'user.login'),
  instances.model.populateOwnerAndCreatedBy('sessionUser'),
  messenger.emitInstanceUpdate('instance', 'starting'),
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
      instances.model.modifyContainerInspectStartStopErr(),
      instances.model.populateOwnerAndCreatedBy('sessionUser'),
      messenger.emitInstanceUpdate('instance', 'start-error'),
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
    hosts.create(),
    hosts.model.upsertHostsForInstance('ownerUsername', 'instance'))
  .catch(
    mw.req().setToErr('err'),
    mw.next('err')),
  // success!
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
  instances.model.isNotStartingOrStopping(),
  instances.model.setContainerStateToStopping(),
  // get owner username
  mw.req().set('user', 'sessionUser'),
  users.model.findGithubUserByGithubId('instance.owner.github'),
  checkFound('user', 'Owner not found'),
  mw.req().set('ownerUsername', 'user.login'),
  instances.model.populateOwnerAndCreatedBy('sessionUser'),
  messenger.emitInstanceUpdate('instance', 'stopping'),
  flow.try(
    mw.req().set('dockerHost', 'instance.container.dockerHost'),
    // update weave while container is potentially running
    sauron.create('dockerHost'),
    sauron.model.detachHostFromContainer(
      'instance.network.networkIp',
      'instance.network.hostIp',
      'instance.container.dockerContainer'),
    // DONT delete host entries
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
    instances.model.modifyContainerInspectStartStopErr(),
    instances.model.populateOwnerAndCreatedBy('sessionUser'),
    messenger.emitInstanceUpdate('instance', 'stop-error'),
    mw.next('err')),
  instances.model.populateOwnerAndCreatedBy('sessionUser'),
  instances.model.populateModels(),
  messenger.emitInstanceUpdate('instance', 'stop'),
  mw.res.json('instance'));
