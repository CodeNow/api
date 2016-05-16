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
var logger = require('middlewares/logger')(__filename)
var me = require('middlewares/me')
var messenger = require('middlewares/socket').messenger
var mongoMiddlewares = require('middlewares/mongo')
var ownerIsHelloRunnable = require('middlewares/owner-is-hello-runnable')
var rabbitMQ = require('models/rabbitmq')
var requestTrace = require('middlewares/request-trace')
var timers = require('middlewares/apis').timers
var transformations = require('middlewares/transformations')
var utils = require('middlewares/utils')
var validations = require('middlewares/validations')

var Boom = mw.Boom
var builds = mongoMiddlewares.builds
var contextVersions = mongoMiddlewares.contextVersions
var isolations = mongoMiddlewares.isolations
var instances = mongoMiddlewares.instances

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
  contextVersions.findById('build.contextVersions[0]'),
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
  mw.body('elasticHostname').require().then(
    mw.body('elasticHostname').string()),
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

/* Routes Start */

/** Get's the list of instances to be displayed to the user.  This should contain all of the
 *  instances owned by the owner, as well as those owned by groups (s)he is part of
 *  @event GET rest/instances
 *  @memberof module:rest/instances */
app.get('/instances/',
  utils.formatFieldFilters(),
  mw.query('hostname').require()
    .then(
      mw.query().set('elasticHostname', 'query.hostname.toLowerCase()'),
      mw.query().unset('hostname')
  ),
  mw.query({
    or: [
      'elasticHostname',
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
      'elasticHostname',
      // NOTE(tj) needed for hotfix
      '["container.inspect.NetworkSettings.IPAddress"]'
    ]
  }).require(),
  // Note: be careful pick does not work like the others,
  // pick only works with keys and not keypaths!
  mw.query('owner', 'shortHash', 'name', 'elasticHostname',
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
    'ipWhitelist',
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
  function (req, res, next) {
    Instance.createInstance(req.body, req.sessionUser)
      .then(function (instance) {
        req.instance = instance
        return instance.populateModelsAsync()
      })
      .asCallback(next)
  },
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
            if (!keypather.get(req, 'body.isolated') && !keypather.get(req, 'instance.isolated')) {
              // If we're setting this container to be isolated, don't delete any others
              InstanceService.deleteForkedInstancesByRepoAndBranch(
                req.instanceId,
                mainAppCodeVersion.lowerRepo, mainAppCodeVersion.lowerBranch, next)
            } else {
              next()
            }
          }),
      mw.body().set('contextVersion', 'contextVersion.toJSON()'),
      function (req, res, next) {
        var sessionUserGithubId = req.sessionUser.accounts.github.id
        InstanceService.updateInstanceBuild(req.instance, req.body, sessionUserGithubId).asCallback(next)
      })
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
  findBuild,
  mw.body('name', 'env', 'owner').pick(),
  function (req, res, next) {
    var body = req.body
    var parentInstance = req.instance
    body.parent = parentInstance.shortHash
    body.build = req.build._id.toString()
    body.env = body.env || parentInstance.env
    body.owner = body.owner || parentInstance.owner
    body.masterPod = body.masterPod || parentInstance.masterPod
    Instance.createInstance(req.body, req.sessionUser)
      .then(function (instance) {
        req.instance = instance
        return instance.populateModelsAsync()
      })
      .asCallback(next)
  },
  // Now return the new instance
  mw.res.status(201),
  mw.res.json('instance')
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
    var tid = keypather.get(process.domain, 'runnableData.tid.toString()')
    InstanceService
      .startInstance(req.instance, req.sessionUser.accounts.github.id, tid)
      .asCallback(function (err, instance) {
        if (err) { return next(err) }
        req.instance = instance
        next()
      })
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
  instances.model.populateModels(),
  function (req, res, next) {
    InstanceService
      .restartInstance(req.instance, req.sessionUser.accounts.github.id)
      .asCallback(function (err, instance) {
        if (err) { return next(err) }
        req.instance = instance
        next()
      })
  },
  mw.res.json('instance'))

/** Stop instance container
 *  @event PUT rest/instances/:id
 *  @memberof module:rest/instances */
app.put('/instances/:id/actions/stop',
  logger(['body'], 'ROUTE: instances/:id/actions/stop', 'info'),
  findInstance,
  flow.or(
    me.isOwnerOf('instance'),
    me.isModerator),
  instances.model.populateModels(),
  function (req, res, next) {
    InstanceService
      .stopInstance(req.instance, req.sessionUser.accounts.github.id)
      .asCallback(function (err, instance) {
        if (err) {
          return next(err)
        }
        req.instance = instance
        next()
      })
  },
  mw.res.json('instance'))
