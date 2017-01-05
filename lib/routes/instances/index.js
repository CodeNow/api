/**
 * route handlers defined in this module:
 * GET /instances
 * POST /instances
 * GET /instances/:id
 * GET /instances/:id/build
 * DELETE /instances/:id
 * PATCH /instances/:id
 * POST /instances/:id/actions/redeploy
 * PUT /instances/:id/actions/start
 * PUT /instances/:id/actions/restart
 * PUT /instances/:id/actions/stop
 * @module lib/routes/instances/index
 */
'use strict'

const express = require('express')
const flow = require('middleware-flow')
const keypather = require('keypather')()
const mw = require('dat-middleware')

const BuildService = require('models/services/build-service')
const Instance = require('models/mongo/instance')
const InstanceForkService = require('models/services/instance-fork-service')
const InstanceService = require('models/services/instance-service')
const IsolationService = require('models/services/isolation-service')
const PermissionService = require('models/services/permission-service')

const GitHub = require('models/apis/github')

const Hosts = require('models/redis/hosts')
const logger = require('middlewares/logger')(__filename)
const rabbitMQ = require('models/rabbitmq')
const transformations = require('middlewares/transformations')
const utils = require('middlewares/utils')
const validations = require('middlewares/validations')

const Boom = mw.Boom

const app = module.exports = express()

var findInstance = function (req, res, next) {
  InstanceService.findInstance(req.params.id)
  .tap(function (instance) {
    return PermissionService.ensureOwnerOrModerator(req.sessionUser, instance)
  })
  .tap(function (instance) {
    req.instance = instance
    req.instanceId = instance._id
  })
  .asCallback(function (err) {
    next(err)
  })
}

var findBuild = function (req, res, next) {
  var buildId = keypather.get(req, 'instance.build')
  if (req.body.build) {
    buildId = req.body.build
  }
  BuildService.findBuildAndAssertAccess(buildId, req.sessionUser)
  .tap(function (build) {
    req.build = build
  })
  .tap(function (build) {
    if (!build.started) {
      throw Boom.badRequest("Instances cannot use builds that haven't been started")
    }
  })
  .asCallback(function (err) {
    next(err)
  })
}

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
      function (req, res, next) {
        var isolationId = keypather.get(req, 'body.isolated')
        IsolationService.findIsolation(isolationId, req.sessionUser)
        .tap(function (isolation) {
          req.isolation = isolation
        })
        .asCallback(function (err) {
          next(err)
        })
      }
    ),
  mw.body('isIsolationGroupMaster').require()
    .then(mw.body('isIsolationGroupMaster').boolean()),
  mw.body('ipWhitelist').require().then(
    mw.body('ipWhitelist').validate(validations.isObject)),
  mw.body('ipWhitelist.enabled').require()
    .then(mw.body('ipWhitelist.enabled').boolean()),
  mw.body('isTesting').require()
    .then(mw.body('isTesting').boolean()),
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
      mw.query('hostname').string(),
      function (req, res, next) {
        var hosts = new Hosts()
        hosts.validateHostname(req.query.hostname, next)
      },
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
  mw.query('githubUsername').require()
    .then(
      function (req, res, next) {
        var github = new GitHub({
          token: keypather.get(req, 'sessionUser.accounts.github.accessToken')
        })
        github.getUserByUsernameAsync(keypather.get(req, 'query.githubUsername'))
        .tap(function (result) {
          keypather.set(req.query, 'owner.github', result.id)
        })
        .asCallback(next)
      }),
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
      function (req, res, next) {
        PermissionService.ensureModelAccess(req.sessionUser, {
          owner: {
            github: req.query['owner.github']
          }
        })
        .asCallback(function (err) {
          next(err)
        })
      }),
  function (req, res, next) {
    // implement default query opts for Isolation variables
    req.query = Instance.addDefaultIsolationOpts(req.query)
    InstanceService.fetchInstances(req.query, req.sessionUser)
      .tap(function (instances) {
        req.instances = instances
      })
      .asCallback(function (err) {
        next(err)
      })
  },
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
  mw.body('build').require().validate(validations.isObjectId),
  mw.body(
    'autoForked',
    'build',
    'env',
    'ipWhitelist',
    'isIsolationGroupMaster',
    'isolated',
    'isTesting',
    'masterPod',
    'name',
    'owner',
    'parent',
    'shouldNotAutofork',
    'testingParentId'
  ).pick(),
  // validate body types
  mw.body('owner.github').require()
    .then(
      mw.body('owner.github').number(),
      mw.req('isInternalRequest').require() // skip owner check if internal
        .else(
          function (req, res, next) {
            PermissionService.isOwnerOf(req.sessionUser, req.body)
            .asCallback(function (err) {
              next(err)
            })
          })),
  bodyValidations,
  function (req, res, next) {
    InstanceService.createInstance(req.body, req.sessionUser)
      .then(function (instance) {
        return instance.populateModelsAsync()
      })
      .then(function (instance) {
        req.instance = instance
      })
      .asCallback(function (err) {
        // Handle errors like this or you hit issues between domains and promises
        next(err)
      })
  },
  mw.res.send(201, 'instance')
)

/** Get in a instance
 *  @event GET rest/instances/:id
 *  @memberof module:rest/instances */
app.get('/instances/:id',
  findInstance,
  function (req, res, next) {
    req.instance.populateModelsAsync()
    .tap(function (instance) {
      req.instance = instance
    })
    .asCallback(function (err) {
      next(err)
    })
  },
  mw.res.json('instance'))

/**
 * Polling route used by frontend to determine if a new build was pushed
 *  @event GET rest/instances/:id/containers
 *  @memberof module:rest/instances/:id/containers */
app.get('/instances/:id/build',
  findInstance,
  mw.res.json('instance.build')) // buildId as string

/** Route for redeploying an instance with a new build or just update instance data
 *  @event PATCH rest/instances/:id
 *  @memberof module:rest/instances */
app.patch('/instances/:id',
  findInstance,
  // Check for non-changes
  mw.body('build').validate(validations.equals('instance.build.toString()'))
    .then(
      mw.body().unset('build')),
  function (req, res, next) {
    InstanceService.updateInstance(req.instance, req.body, req.sessionUser)
      .then(function (instance) {
        return instance.populateModelsAsync()
      })
      .tap(function (instance) {
        req.instance = instance
      })
      .asCallback(function (err) {
        // Handle errors like this or you hit issues between domains and promises
        if (err) {
          logger.log.error({
            error: err,
            route: 'PATCH /instance/:id'
          })
        }
        next(err)
      })
  },
  mw.res.json('instance'))

/** Delete in a instance
 *  @event DELETE rest/instances/:id
 *  @memberof module:rest/instances */
app.delete('/instances/:id',
  findInstance,
  function (req, res, next) {
    rabbitMQ.deleteInstance({
      instanceId: keypather.get(req, 'instance.id')
    })
    next()
  },
  mw.res.status(204),
  mw.res.end())

/** Creates a container (instance.container) from the current instance build (instance.build)
 *  @event PUT rest/instances/:id
 *  @event POST rest/instances/:id/actions/redeploy
 *  @params id: instance id
 */
app.post('/instances/:id/actions/redeploy',
  findInstance,
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
      instanceId: req.instanceId.toString(),
      sessionUserGithubId: req.sessionUser.accounts.github.id
    })
    next()
  },
  function (req, res, next) {
    return req.instance.populateModelsAsync()
    .tap(function (instance) {
      req.instance = instance
    })
    .asCallback(function (err) {
      next(err)
    })
  },
  mw.res.json('instance'))

/** Start instance container
 *  @event PUT rest/instances/:id
 *  @memberof module:rest/instances */
app.put('/instances/:id/actions/start',
  function (req, res, next) {
    InstanceService
      .startInstance(req.params.id, req.sessionUser)
      .tap(function (instance) {
        req.instance = instance
      })
      .asCallback(function (err) {
        next(err)
      })
  },
  mw.res.json('instance'))

/* instance container
 *  @event PUT rest/instances/:id
 *  @memberof module:rest/instances */
app.put('/instances/:id/actions/restart',
  function (req, res, next) {
    InstanceService
      .restartInstance(req.params.id, req.sessionUser)
      .tap(function (instance) {
        req.instance = instance
      })
      .asCallback(function (err) {
        next(err)
      })
  },
  mw.res.json('instance'))

/** Stop instance container
 *  @event PUT rest/instances/:id
 *  @memberof module:rest/instances */
app.put('/instances/:id/actions/stop',
  function (req, res, next) {
    InstanceService
      .stopInstance(req.params.id, req.sessionUser)
      .tap(function (instance) {
        req.instance = instance
      })
      .asCallback(function (err) {
        next(err)
      })
  },
  mw.res.json('instance'))

/**
 * Middleware helper to fork an instance
 * @param {Object} req - Express request object
 * @param {Object} req.body - Request body
 * @param {String} req.body.branch - branch to fork
 * @param {String} req.body.sha - commit sha to fork
 * @param {Object} req.sessionUser - session user
 * @resolves {Instance} Forked instance
 * @returns {Promise}
 */
module.exports.forkInstance = function (req) {
  var log = logger.log
  const githubPushInfo = {
    repo: req.instance.getRepoName(),
    branch: req.body.branch,
    commit: req.body.sha,
    user: {
      id: req.sessionUser.accounts.github.id
    }
  }
  log.info({
    githubPushInfo: githubPushInfo
  }, 'Forking master instance')
  return BuildService.createAndBuildContextVersion(req.instance, githubPushInfo, 'manual')
    .then(function (result) {
      log.trace('fork master instance')
      var newBuild = result.build
      var user = result.user
      return InstanceForkService.forkMasterInstance(
        req.instance,
        newBuild._id.toString(),
        githubPushInfo.branch,
        user
      )
    })
    .tap(function (newInstance) {
      return IsolationService.autoIsolate([newInstance], githubPushInfo)
    })
}

/**
 * Fork instance route, requires body of { branch: String, sha: String }
 * @param {String} body.branch - name of github branch you'd like to run
 * @param {String} body.sha - github sha of the commit you'd like to run
 * @event POST rest/instances/:id/fork
 * @memberof module:rest/instances
 */
app.post('/instances/:id/fork',
  findInstance,
  function (req, res, next) {
    if (!req.instance.masterPod) {
      return next(Boom.badRequest('Forking is only allowed for masterpod instances'))
    }
    module.exports.forkInstance(req)
      .asCallback(function (err) {
        next(err)
      })
  },
  function (req, res, next) {
    res.send(201)
  })
