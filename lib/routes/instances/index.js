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

var Instance = require('models/mongo/instance');
var checkFound = require('middlewares/check-found');
var instanceService = require('middlewares/services').instanceService;
var error = require('error');
var github = require('middlewares/apis').github;
var docker = require('middlewares/apis').docker;
var hosts = require('middlewares/redis').hosts;
var isInternalRequest = require('middlewares/is-internal-request');
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
var utils = require('middlewares/utils');
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
  logger(['body', 'params.id'], 'ROUTE: createContainer', 'info'),
  findBuildContextVersion,
  findContextVersionContext,
  mw.req('body.forceDock').require()
    .then(
      logger(['body'], 'ROUTE: createContainer body.forceDock', 'trace'),
      mw.req().set('dockerHost', 'body.forceDock'))
    .else(
      logger(['body'], 'ROUTE: createContainer !body.forceDock', 'trace'),
      mavis.create(),
      mavis.model.findDockForContainer('contextVersion', 'context'),
      mw.req().set('dockerHost', 'mavisResult')),
  function (req, res, next) {
    req.instanceEnvs = req.instance.env;
    if (req.instance.toJSON) {
      req.instanceEnvs = req.instance.toJSON().env;
    }
    req.instanceEnvs.push('RUNNABLE_CONTAINER_ID=' + req.instance.shortHash);
    var cvId = keypather.get(req, 'contextVersion._id.toString()');
    var labels = {
      contextVersionId : cvId,
      instanceId       : keypather.get(req, 'instance._id.toString()'),
      instanceName     : keypather.get(req, 'instance.name.toString()'),
      instanceShortHash: keypather.get(req, 'instance.shortHash.toString()'),
      ownerUsername    : keypather.get(req, 'ownerUsername'),
      creatorGithubId  : keypather.get(req, 'instance.createdBy.github.toString()'),
      ownerGithubId    : keypather.get(req, 'instance.owner.github.toString()'),
      sessionUserGithubId : keypather.get(req, 'sessionUser.accounts.github.id.toString()')
    };
    var createContainerJobData = {
      buildId: keypather.get(req, 'build._id.toString()'),
      cvId: cvId,
      dockerHost: req.dockerHost,
      instanceEnvs: req.instanceEnvs,
      labels: labels,
      sessionUserId: keypather.get(req, 'sessionUser._id.toString()')
    };
    rabbitMQ.createInstanceContainer(createContainerJobData);
    next();
  });

/**
 *  Remove instance container
 *  @param {String} instanceKey      instance key on req
 *  @param {String} oldContainerKey  instance's old container key on req
 *  @param {String} sessionUserIdKey instance's owner's id on req
 *  // also assumes req.instance exists
 */
var removeInstanceContainer = // TODO: this has a lot of overlap with instance stop
  function (instanceKey, oldContainerKey, sessionUserIdKey) {
    return flow.series(
      mw.req().set('instance', instanceKey),
      mw.req().set('container', oldContainerKey),
      mw.req().set('sessionUserId', sessionUserIdKey),
      logger(['body', 'instance', 'container', 'sessionUserId'],
             'ROUTE: removeInstanceContainer', 'trace'),
      mw.req('container.dockerContainer').require()
        .then( // has a docker container
          function (req, res, next) {
            var branch = Instance.getMainBranchName(req.instance);
            rabbitMQ.deleteInstanceContainer({
              instanceShortHash: req.instance.shortHash,
              instanceName: req.instance.name,
              instanceMasterPod: req.instance.masterPod,
              instanceMasterBranch: branch,
              container: req.container,
              networkIp: keypather.get(req, 'instance.network.networkIp'),
              hostIp: keypather.get(req, 'instance.network.hostIp'),
              ownerGithubId: keypather.get(req, 'instance.owner.github'),
              sessionUserId: req.sessionUserId
            });
            next();
          }
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
  // we need this code because createContainer uses ownerUsername
  mw.req().set('user', 'sessionUser'),
  users.model.findGithubUserByGithubId('instance.owner.github'),
  checkFound('user', 'Owner not found'),
  mw.req().set('ownerUsername', 'user.login'),
  // cache old container so old hipache routes can be removed
  mw.req().set('oldContainer', 'instance.container'),
  // UPDATE INSTANCE with BODY - FIRST to ensure there is no conflict (name)
  instances.findByIdAndUpdate('instanceId', {
    $set: 'body',
    $unset: { container: 1 }
  }),
  // remove old container
  removeInstanceContainer('instance', 'oldContainer', 'sessionUser.id'),
  // create container if build is successful
  mw.req('build.successful').validate(validations.equals(true))
    .then(
      logger(['body', 'build'], 'ROUTE: updateInstanceBuild build.successful', 'trace'),
      createContainer)
    .else(
      logger(['body', 'build'], 'ROUTE: updateInstanceBuild !build.successful', 'trace')
    )
);


/* Routes Start */


/** Get's the list of instances to be displayed to the user.  This should contain all of the
 *  instances owned by the owner, as well as those owned by groups (s)he is part of
 *  @event GET rest/instances
 *  @memberof module:rest/instances */
app.get('/instances/',
  utils.formatFieldFilters(),
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
  instances.find('query', { 'contextVersion.build.log': false }),
  timers.model.startTimer('populateOwnerAndCreatedByForInstances'),
  instances.populateOwnerAndCreatedByForInstances('sessionUser', 'instances'),
  timers.model.stopTimer('populateOwnerAndCreatedByForInstances'),
  timers.model.startTimer('instance-route.populateModels'),
  instances.models.populateModels(),
  timers.model.stopTimer('instance-route.populateModels'),
  utils.applyFieldFilters('instances'),
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
  mw.body('build').require()
    .then( // build was updated
      logger(['body'], 'ROUTE: build.require()', 'trace'),
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
      // remove all instances where branch equals main branch from the build
      // this will help to avoid having 2 instances with same branches
      mw.req().set('mainAppCodeVersion', 'contextVersion.getMainAppCodeVersion()'),
      instanceService.create(),
      instanceService.model.deleteForkedInstancesByRepoAndBranch('sessionUser.id',
        'mainAppCodeVersion.lowerRepo', 'mainAppCodeVersion.lowerBranch'),
      updateInstanceBuild)
    .else(
      logger(['body'], 'ROUTE: !build.require()', 'trace'),
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
  function (req, res, next) {
    rabbitMQ.deleteInstance({
      instanceId: keypather.get(req, 'instance.id'),
      instanceName: keypather.get(req, 'instance.name'),
      sessionUserId: keypather.get(req, 'sessionUser.id'),
      tid: req.domain.runnableData.tid
    });
    next();
  },
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
  logger(['body', 'params.id'], 'POST_INSTANCES_ID_ACTIONS_DEPLOY', 'info'),
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
  mw.req('build').validate(validations.exists('completed'))
    .else(mw.next(Boom.badRequest('Cannot deploy an instance with an incomplete build'))),
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
  mw.req().set('currentUser', 'instance.owner.github'),
  // if moderator, we need to use createdBy user.
  flow.mwIf(me.isModerator)
    .then(mw.req().set('currentUser', 'instance.createdBy.github')),
  mw.req().set('user', 'sessionUser'),
  users.model.findGithubUserByGithubId('currentUser'),
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
    // cache old container so old hipache routes can be removed
    mw.req().set('oldContainer', 'instance.container'),
    // UPDATE INSTANCE with BODY - FIRST to ensure there is no conflict (name)
    instances.model.update({ $unset: { container: 1 } }),
    instances.findById('instanceId'),
    // remove old container
    removeInstanceContainer(
      'instance', 'oldContainer', 'sessionUser.id'),
    // remove dockerHost from cv if we are rolling
    mw.query('rollingUpdate').validate(validations.equals('true'))
      .then(contextVersions.model.clearDockerHost()),
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
  instances.model.populateOwnerAndCreatedBy('sessionUser'),
  flow.or(
    me.isOwnerOf('instance'),
    me.isModerator),
  mw.req('instance.container.dockerContainer').require()
    .else(
      mw.next(Boom.badRequest('Instance does not have a container'))),
  /**
   * - Check if instance is starting or stopping.
   * - Insert task into queue to start
   * - attempt set to starting
   *   - return error if state is already start or stopping
   *   (if already starting and set to starting fails, another request
   *   won race)
   */
  instances.model.isNotStartingOrStopping(),
  function (req, res, next) {
    rabbitMQ.startInstanceContainer({
      dockerContainer: req.instance.container.dockerContainer,
      dockerHost: req.instance.container.dockerHost,
      hostIp: req.instance.network.hostIp,
      instanceId: req.instance._id.toString(),
      networkIp: req.instance.network.networkIp,
      ownerUsername: req.instance.owner.username,
      sessionUserGithubId: req.sessionUser.accounts.github.id,
      tid: req.domain.runnableData.tid
    });
    next();
  },
  instances.model.setContainerStateToStarting(),
  mw.res.json('instance'));

/* instance container
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
    flow.try(
      docker.model.restartContainer('instance.container')
    ).catch(
      mw.req().setToErr('restartErr'),
      instances.model.setContainerStateToStarting(),
      instances.model.populateOwnerAndCreatedBy('sessionUser'),
      messenger.emitInstanceUpdate('instance', 'start-error'),
      // don't ignore next die
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
  logger(['body'], 'ROUTE: instances/:id/actions/stop', 'info'),
  findInstance,
  instances.model.populateOwnerAndCreatedBy('sessionUser'),
  flow.or(
    me.isOwnerOf('instance'),
    me.isModerator),
  mw.req('instance.container.dockerContainer').require()
    .else(
      mw.next(Boom.badRequest('Instance does not have a container'))),
  instances.model.isNotStartingOrStopping(),
  function (req, res, next) {
    rabbitMQ.stopInstanceContainer({
      dockerContainerId: req.instance.container.dockerContainer,
      dockerHost: req.instance.container.dockerHost,
      hostIp: req.instance.network.hostIp,
      instanceId: req.instance._id.toString(),
      networkIp: req.instance.network.networkIp,
      ownerUsername: req.instance.owner.username,
      sessionUserGithubId: req.sessionUser.accounts.github.id,
      tid: req.domain.runnableData.tid
    });
    next();
  },
  instances.model.setContainerStateToStopping(),
  mw.res.json('instance'));
