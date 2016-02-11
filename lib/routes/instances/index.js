/**
 * route handlers defined in this module:
 * GET /instances
 * POST /instances
 * GET /instances/:id
 * GET /instances/:id/build
 * POST /instances/:id/actions/copy
 * DELETE /instances/:id
 * PATCH /instances/:id
 * POST /instances/:id/actions/redeploy
 * PUT /instances/:id/actions/start
 * PUT /instances/:id/actions/restart
 * PUT /instances/:id/actions/stop
 * @module lib/routes/instances/index
 */
'use strict'

var express = require('express')
var flow = require('middleware-flow')
var keypather = require('keypather')()
var mw = require('dat-middleware')

var Instance = require('models/mongo/instance')
var InstanceService = require('models/services/instance-service')

var checkFound = require('middlewares/check-found')

var github = require('middlewares/apis').github
var docker = require('middlewares/apis').docker
var hosts = require('middlewares/redis').hosts
var logger = require('middlewares/logger')(__filename)
var me = require('middlewares/me')
var messenger = require('middlewares/socket').messenger
var mongoMiddlewares = require('middlewares/mongo')
var ownerIsHelloRunnable = require('middlewares/owner-is-hello-runnable')
var rabbitMQ = require('models/rabbitmq')
var requestTrace = require('middlewares/request-trace')
var runnable = require('middlewares/apis').runnable
var timers = require('middlewares/apis').timers
var transformations = require('middlewares/transformations')
var utils = require('middlewares/utils')
var validations = require('middlewares/validations')

var Boom = mw.Boom
var builds = mongoMiddlewares.builds
var contextVersions = mongoMiddlewares.contextVersions
var instanceCounter = mongoMiddlewares.instanceCounters
var isolations = mongoMiddlewares.isolations
var instances = mongoMiddlewares.instances
var users = mongoMiddlewares.users

var app = module.exports = express()

var findInstance = flow.series(
  instances.findOneByShortHash('params.id'),
  checkFound('instance'),
  // putting the instance._id on req so we don't lose it (and have to search by hash again)
  mw.req().set('instanceId', 'instance._id'))

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
    .else(mw.next(Boom.badRequest("Instances cannot use builds that haven't been started"))))

var findBuildContextVersion = flow.series(
  mw.req('build.contextVersions.length').validate(validations.notEquals(0))
    .else(mw.next(Boom.badRequest('Build must have a contextVersion'))),
  contextVersions.findById('build.contextVersions[0]', {'build.log': false}),
  checkFound('contextVersion'),
  mw.req('contextVersion.build.started').require()
    .else(
      mw.next(Boom.badRequest(
        'Cannot attach a build to an instance with context ' +
        'versions that have not started building'))))

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
          return !(/^\s*$/.test(val))
        })
      }),
      mw.body('env').each(
        function (env, req, eachReq, res, next) {
          eachReq.env = env
          next()
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
  mw.body('isolated').require()
    .then(
      mw.body('isolated').validate(validations.isObjectId),
      isolations.findById('body.isolated'),
      checkFound('isolation'),
      me.isOwnerOf('isolation')
    ),
  mw.body('isIsolationGroupMaster').require()
    .then(mw.body('isIsolationGroupMaster').boolean()),
  mw.body('ipWhitelist').require().then(
    mw.body('ipWhitelist').validate(validations.isObject)),
  mw.body('ipWhitelist.enabled').require()
    .then(mw.body('ipWhitelist.enabled').boolean()),
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
                .else(mw.next(Boom.badRequest('Instance owner must match Build owner')))))))

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
  function (req, res, next) {
    var instance = req.instance
    var container = req.oldContainer
    if (container && container.dockerContainer) {
      var branch = Instance.getMainBranchName(instance)
      rabbitMQ.deleteInstanceContainer({
        instanceShortHash: instance.shortHash,
        instanceName: instance.name,
        instanceMasterPod: instance.masterPod,
        instanceMasterBranch: branch,
        container: container,
        ownerGithubId: keypather.get(instance, 'owner.github'),
        ownerGithubUsername: keypather.get(instance, 'owner.username')
      })
    }
    next()
  },
  // create container if build is successful
  findBuild,
  mw.req('build.successful').validate(validations.equals(true))
    .then(
      logger([ 'body', 'build' ], 'ROUTE: updateInstanceBuild build.successful', 'trace'),
      function (req, res, next) {
        rabbitMQ.createInstanceContainer({
          instanceId: req.instanceId,
          contextVersionId: req.build.contextVersions[0],
          sessionUserGithubId: req.sessionUser.accounts.github.id,
          ownerUsername: req.ownerUsername
        })
        next()
      }
  ).else(
    logger([ 'body', 'build' ], 'ROUTE: updateInstanceBuild !build.successful', 'trace')
  )
)

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
  mw.query({
    or: [
      'owner.github',
      'githubUsername',
      '["owner.github"]',
      // NOTE(tj) needed for hotfix
      '["container.inspect.NetworkSettings.IPAddress"]'
    ]
  }).require(),
  timers.create(),
  timers.model.startTimer('githubUsername_check'),
  mw.query('githubUsername').require()
    .then(
      github.create(),
      github.model.getUserByUsername('query.githubUsername'),
      mw.query().set('owner.github', 'githubResult.id')),
  timers.model.stopTimer('githubUsername_check'),
  mw.query({
    or: [
      'owner', 'shortHash', 'name', '["contextVersion.appCodeVersions.repo"]',
      '["network.hostIp"]', 'masterPod', '["contextVersion.context"]', '_id',
      // NOTE(tj) needed for hotfix
      '["container.inspect.NetworkSettings.IPAddress"]'
    ]
  }).require(),
  // Note: be careful pick does not work like the others,
  // pick only works with keys and not keypaths!
  mw.query('owner', 'shortHash', 'name',
    'owner.github', 'contextVersion.appCodeVersions.repo',
    'network.hostIp', 'masterPod', 'contextVersion.context', '_id',
    'container.inspect.NetworkSettings.IPAddress', 'container.dockerHost',
    'isolated', 'isIsolationGroupMaster'
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
  // implement default query opts for Isolation variables
  function (req, res, next) {
    // using this function 'cause mongoosemiddleware doesn't let me replace query
    req.query = Instance.addDefaultIsolationOpts(req.query)
    next()
  },
  instances.find('query', { 'contextVersion.build.log': false }),
  timers.model.startTimer('populateOwnerAndCreatedByForInstances'),
  instances.populateOwnerAndCreatedByForInstances('sessionUser', 'instances'),
  timers.model.stopTimer('populateOwnerAndCreatedByForInstances'),
  timers.model.startTimer('populateModels'),
  instances.populateModels('instances'),
  timers.model.stopTimer('populateModels'),
  utils.applyFieldFilters('instances'),
  mw.res.json('instances'))

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
  mw.body(
    'autoForked',
    'build',
    'env',
    'isIsolationGroupMaster',
    'isolated',
    'masterPod',
    'name',
    'owner',
    'parent'
  ).pick(),
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
        req.instanceName = 'Instance' + req.instanceCounter
        next()
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
  // If the build has completed, but hasn't failed, create the container
  builds.findById('build._id'), // to avoid race with build route!
  instances.model.save(),
  mw.req('build.successful').validate(validations.equals(true))
    .then(
      function (req, res, next) {
        rabbitMQ.createInstanceContainer({
          instanceId: req.instance._id,
          contextVersionId: req.build.contextVersions[0],
          sessionUserGithubId: req.sessionUser.accounts.github.id,
          ownerUsername: req.ownerUsername
        })
        next()
      }),
  // If the build hasn't finished yet, this will deploy when it finishes
  instances.model.populateOwnerAndCreatedBy('sessionUser'),
  instances.model.populateModels(),
  messenger.emitInstanceUpdate('instance', 'post'),
  mw.res.send(201, 'instance'))

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
  mw.res.json('instance'))

/**
 * Polling route used by frontend to determine if a new build was pushed
 *  @event GET rest/instances/:id/containers
 *  @memberof module:rest/instances/:id/containers */
app.get('/instances/:id/build',
  findInstance,
  flow.or(
    me.isOwnerOf('instance'),
    me.isModerator),
  mw.res.json('instance.build')) // buildId as string

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
    or: [ 'public', 'build', 'env', 'locked', 'container', 'masterPod',
      'isolated', 'isIsolationGroupMaster', 'ipWhitelist' ]
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
          function (req, res, next) {
            var oldCvId = keypather.get(req, 'oldContextVersion._id')
            req.body.lastBuiltSimpleContextVersion = {
              id: oldCvId,
              created: Date.now()
            }
            var mainAppCodeVersion = req.contextVersion.getMainAppCodeVersion()
            InstanceService.deleteForkedInstancesByRepoAndBranch(
              req.instanceId,
              mainAppCodeVersion.lowerRepo, mainAppCodeVersion.lowerBranch, next)
          }),
      mw.body().set('contextVersion', 'contextVersion._doc'),
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
  mw.res.json('instance'))

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
      tid: req.domain.runnableData.tid
    })
    next()
  },
  mw.res.status(204),
  mw.res.end())

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
)

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
  function (req, res, next) {
    rabbitMQ.redeployInstanceContainer({
      instanceId: req.instanceId,
      sessionUserGithubId: req.sessionUser.accounts.github.id
    })
    next()
  },
  instances.model.populateOwnerAndCreatedBy('sessionUser'),
  instances.model.populateModels(),
  mw.req().set('instance.owner.username', 'ownerUsername'),
  mw.res.json('instance'))

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
  instances.model.populateModels(),
  function (req, res, next) {
    InstanceService
      .startInstance(req.instance, req.sessionUser.accounts.github.id)
      .asCallback(next)
  },
  mw.res.json('instance'))

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
    docker.create(),
    // ignore next die
    flow.try(
      docker.model.restartContainer('instance.container.dockerContainer')
    ).catch(
      mw.req().setToErr('restartErr'),
      instances.model.setContainerStateToStarting(),
      instances.model.populateOwnerAndCreatedBy('sessionUser'),
      messenger.emitInstanceUpdate('instance', 'start-error'),
      // don't ignore next die
      mw.next('restartErr')
    ),
    instances.model.inspectAndUpdate(),
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
  mw.res.json('instance'))

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
      containerId: req.instance.container.dockerContainer,
      dockerHost: req.instance.container.dockerHost,
      instanceId: req.instance._id.toString(),
      ownerUsername: req.instance.owner.username,
      sessionUserGithubId: req.sessionUser.accounts.github.id,
      tid: req.domain.runnableData.tid
    })
    next()
  },
  instances.model.setContainerStateToStopping(),
  mw.res.json('instance'))
