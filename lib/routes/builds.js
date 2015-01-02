'use strict';

var express = require('express');

// var debug = require('debug')('runnable-api:build');
var app = module.exports = express();
var mw = require('dat-middleware');
var flow = require('middleware-flow');
var keypather = require('keypather')();
var validations = require('middlewares/validations');
var transformations = require('middlewares/transformations');
// var apiMiddlewares = require('middlewares/apis');
var mongoMiddlewares = require('middlewares/mongo');
var builds = mongoMiddlewares.builds;
var contexts = mongoMiddlewares.contexts;
var contextVersions = mongoMiddlewares.contextVersions;
var instances = mongoMiddlewares.instances;
var me = require('middlewares/me');
var checkFound = require('middlewares/check-found');
var not = require('101/not');
var hasProps = require('101/has-properties');
var Boom = mw.Boom;
var runnable = require('middlewares/apis').runnable;
var mavis = require('middlewares/apis').mavis;
var docker = require('middlewares/apis').docker;
var error = require('error');
var createCount = require('callback-count');
var pluck = require('101/pluck');
var noop = require('101/noop');

var findBuild = flow.series(
  mw.params('id').require().validate(validations.isObjectId),
  builds.findById('params.id'),
  checkFound('build'),
  flow.or(
    me.isOwnerOf('build'),
    me.isModerator));

/** Create a build
 *  @returns [Build, ...]
 *  @event POST /builds/
 *  @memberof module:rest/builds */
app.post('/builds/',
  mw.log('create new build', 'isInternalRequest', 'owner'),
  mw.body('owner').require()
    .then(
      mw.req('isInternalRequest').require() // skip owner check if internal
        .else(
          mw.body('owner').validate(validations.isObject),
          mw.body('owner.github').require().number(),
          me.isOwnerOf('body')))
    .else( // if not provided set it to sessionUser
      mw.body().set('owner.github', 'sessionUser.accounts.github.id')),
  mw.body('contextVersions').require().validate(validations.isObjectIdArray)
    .then(
      contextVersions.findByIds('body.contextVersions'),
      mw.body('contextVersions.length')
        .validate(validations.equalsKeypath('contextVersions.length'))
        .else(mw.next(Boom.notFound('Some contextVersions not found'))),
      contexts.findByVersions('contextVersions'),
      mw.req('contexts').each(
        function (context, req, eachReq, res, next) {
          eachReq.context = context;
          next();
        },
        mw.log('get owners', 'body.owner', 'context.owner'),
        mw.req('body.owner.github')
          .validate(validations.equalsKeypath('context.owner.github'))
          .else(mw.next(Boom.badRequest('Context versions\' owners must match build owner')))),
      function (req, res, next) {
        req.contextIds = req.contextVersions.map(pluck('context'));
        req.contextVersionIds = req.contextVersions.map(pluck('_id'));
        next();
      }
    ),
  builds.create({
    createdBy: {
      github: 'sessionUser.accounts.github.id'
    },
    owner: {
      github: 'body.owner.github'
    }
  }),
  mw.req('contextVersionIds.length').require().validate(validations.notEquals(0))
    .then(
      builds.model.set({
        contexts: 'contextIds',
        contextVersions: 'contextVersionIds'
      })),
  builds.model.save(),
  mw.res.json(201, 'build')
);

/** Get list of builds
 *  @returns [Builds...]
 *  @event GET /builds/
 *  @memberof module:rest/builds */
app.get('/builds/',
  mw.query('completed', 'started', 'buildNumber', 'owner', 'contextVersions',
    'sort', 'limit').pick(),
  mw.query('contextVersions').require()
    .then(mw.query('contextVersions').mapValues(transformations.arrayToInQuery)),
  mw.query('owner').require()
    .else(mw.query().set('owner.github', 'sessionUser.accounts.github.id')),
  mw.query('started').require()
    .then(mw.query('started').mapValues(transformations.boolToExistsQuery)),
  mw.query('completed').require()
    .then(mw.query('completed').mapValues(transformations.boolToExistsQuery)),
  mw.req().set('opts', {}),
  mw.query('limit').require()
    .then(
      mw.query('limit').mapValues(transformations.toInt),
      mw.query('limit').number(),
      mw.req().set('opts.limit', 'query.limit'),
      mw.query().unset('limit')),
  mw.query('sort').require()
    .then(
      mw.req().set('opts.sort', 'query.sort'),
      mw.query().unset('sort'),
      mw.req('opts.sort').validate(validations.equalsAny(
        'buildNumber', 'duration', 'started', 'created',
        '-buildNumber', '-duration', '-started', '-created'))
    ),
  builds.find('query', null, 'opts'),
  mw.res.json('builds'));

/** Gets a specific build by id
 *  @param id buildId of the build to return
 *  @returns Build
 *  @event GET /builds/:id
 *  @memberof module:rest/builds */
app.get('/builds/:id',
  findBuild,
  mw.res.json('build'));

/** Copies a build
 *  @param id buildId of the source build
 *  @returns Build
 *  @event GET /builds/
 *  @memberof module:rest/builds */
app.post('/builds/:id/actions/copy',
  findBuild,
  checkFound('build'),
  mw.query('deep').require()
    .then(
      // deep copy
      runnable.create({}, 'sessionUser'),
      runnable.model.deepCopyContextVersions(
        'build.contexts', 'build.contextVersions'),
      mw.req().set('pluck', pluck),
      mw.req().set('copiedContextVersions', 'runnableResult'),
      function (req, res, next) {
        req.copiedContextVersions =
          req.copiedContextVersions.map(pluck('json()'));
        var copiedVersions = req.copiedContextVersions;
        req.contextIds        = copiedVersions.map(pluck('context'));
        req.contextVersionIds = copiedVersions.map(pluck('_id'));
        next();
      },
      builds.create({
        createdBy: {
          github: 'sessionUser.accounts.github.id'
        },
        contexts: 'contextIds',
        contextVersions: 'contextVersionIds',
        owner: 'build.owner'
      }),
      builds.model.save())
    .else(
      // shallow copy
      builds.model.shallowCopy({
        createdBy: {
          github: 'sessionUser.accounts.github.id'
        }
      })),
  mw.res.status(201),
  mw.res.json('build'));

/** Build a build
 *  @param id buildId of the build to build (say that ten times fast)
 *  @returns Build
 *  @event GET /builds/
 *  @memberof module:rest/builds */
app.post('/builds/:id/actions/build',
  mw.log('build build 0'),
  builds.findById('params.id'),
  checkFound('build'),
  mw('build')('completed').require()
    .then(mw.next(Boom.conflict('Build is already built'))),
  mw('build')('started').require()
    .then(mw.next(Boom.conflict('Build is already in progress'))),
  mw.body('message').require().then(mw.body('message').string()),
  mw.body({ or: [
    'triggeredAction.rebuild',
    'triggeredAction.appCodeVersion'
  ]}).require()
    .else(mw.body().set('triggeredAction.manual', true)),
  mw.body('triggeredAction.appCodeVersion').require()
    .then(
      mw.body(
        'triggeredAction.appCodeVersion.repo',
        'triggeredAction.appCodeVersion.commit'
      ).require()
    ),
  mw.log('build build 1'),
  contextVersions.findByIds('build.contextVersions'),
  function (req, res, next) {
    if (req.contextVersions.length === 0) {
      return next(Boom.badRequest('Cannot build a build without context versions'));
    }
    req.contextVersions = req.contextVersions.filter(not(hasProps('build')));
    if (req.contextVersions.length === 0) {
      return next(Boom.conflict('All versions are built (build soon to be marked built)'));
    }
    next();
  },
  builds.model.setInProgress('sessionUser'), // must be set before dedupe
  mw.req().set('attachCount', 0),
  mw.log('build build 2'),
  mw.req('contextVersions').each(
    function (contextVersion, req, eachReq, res, next) {
      eachReq.req = req;
      eachReq.contextVersion = contextVersion;
      next();
    },
    flow.try(
      mw.req().set('originalContextVersion', 'contextVersion'),
      mw.log('build build 3', 'contextVersion.build'),
      contextVersions.model.dedupe(),
      builds.model.replaceContextVersion('originalContextVersion', 'contextVersion'),
      // FIXME: handle errors - bc if buildStarted this falls through to catch
      // then it will try to end an unstarted contextVersion
      mw.req('contextVersion.build.started').require()
        .then(
          checkToRespond,
          mw.req('contextVersion.build.completed').require()
            .then(mw.req('contextVersion.build.error').require()
              .then(builds.model.pushErroredContextVersion('contextVersion._id'))
          ).else(pollMongo({
              idPath: 'contextVersion._id',
              database: require('models/mongo/context-version'),
              successKeyPath: 'build.completed',
              failureKeyPath: 'build.error',
              failureCb: builds.model.pushErroredContextVersion('contextVersion._id')
            }))
        ).else(
          mavis.create(),
          mavis.model.findDockForBuild('contextVersion'),
          contextVersions.model.setBuildStarted('sessionUser', 'mavisResult', 'body'),
          docker.create('mavisResult'),
          contextVersions.model.populate('infraCodeVersion'),
          function (eachReq, res, next) {
            var docker = eachReq.docker;
            var sessionUser = eachReq.sessionUser;
            var contextVersion = eachReq.contextVersion;
            docker.createImageBuilderAndAttach(
              sessionUser, contextVersion, function (err, container) {
                if (err) { return next(err); }
                eachReq.container = container;
                next();
              });
          },
          checkToRespond,
          docker.model.startImageBuilderAndWait('sessionUser', 'contextVersion', 'container'),
          contextVersions.model.setBuildCompleted('dockerResult'))
    ).catch(
      function (err, eachReq, res, next) {
        eachReq.err = err;
        logIfErrAndNext(next)(err);
      },
      function (eachReq, res, next) {
        var count = createCount(2, next);
        eachReq.contextVersion.updateBuildError(eachReq.err,
          logIfErrAndNext(count.next.bind(count)));
        eachReq.build.pushErroredContextVersion(eachReq.contextVersion._id,
          logIfErrAndNext(count.next.bind(count)));
      },
      checkToRespond
    )),
  builds.model.setCompleted(),
  builds.findById('build._id'),
  mw.log('build successful', 'build.successful'),
  mw.req('build.successful').validate(validations.equals(true)).then(
    mw.log('build build was successful'),
    // After the build is completed, redeploy all instances with this build
    instances.findByBuild('build'),
    mw.log('build build was successful and we found instances', 'instances'),
    mw.req('instances').each(
      function (item, req, eachReq, res, next) {
        eachReq.instance = item;
        next();
      },
      runnable.create({}, 'sessionUser'),
      // runnable.model.redeployInstance('instance', { json: { build: 'build._id.toString()' } })
      runnable.model.patchInstance('instance.shortHash', 'build._id'),
      mw.log('redeployed'))),
  // noop is required!! to prevent res.send(404) after the response has already been sent.
  noop
);

/*jshint maxcomplexity:6*/
function pollMongo(input) {
  //(idPath, database, successKeyPath, failureKeyPath, successCb, failureCb)
  return function (req, res, next) {
    var id = keypather.get(req, input.idPath);
    input.database.findById(id, function (err, model) {
      if (err) {
        error.logIfErr(err);
      }
      if (keypather.get(model, input.failureKeyPath)) {
        if (input.failureCb) {
          input.failureCb(req, res, next);
        } else {
          next();
        }
      } else if (keypather.get(model, input.successKeyPath)) {
        if (input.successCb) {
          input.successCb(req, res, next);
        } else {
          next();
        }
      } else {
        setTimeout(pollMongo(input), process.env.BUILD_END_TIMEOUT, req, res, next);
      }
    });
  };
}
/*jshint maxcomplexity:5*/
function logIfErrAndNext (next) {
  return function (err) {
    error.logIfErr(err);
    next();
  };
}

function checkToRespond (eachReq, res, next) {
  if (eachReq.counted) { return next(); }
  eachReq.counted = true;
  var req = eachReq.req;
  req.attachCount++;
  if (req.attachCount === req.contextVersions.length) {
    req.responseSent = true;
    res.json(201, eachReq.build);
  }
  next();
}
