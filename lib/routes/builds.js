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
var Boom = mw.Boom;
var runnable = require('middlewares/apis').runnable;
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

var validateContextVersions = function (req, res, next) {
  if (req.contextVersions.length === 0) {
    return next(Boom.badRequest('Cannot build a build without context versions'));
  }
  if (req.contextVersions.length > 1) {// this should not be possible.
    return next(Boom.badRequest('Cannot build a build with many context versions'));
  }
  next();
};
/** Build a build
 *  @param id buildId of the build to build (say that ten times fast)
 *  @returns Build
 *  @event GET /builds/
 *  @memberof module:rest/builds */
app.post('/builds/:id/actions/build',
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
  contextVersions.findByIds('build.contextVersions'),
  validateContextVersions,
  mw.req().set('contextVersion', 'contextVersions[0]'),
  builds.model.setInProgress('sessionUser'), // must be set before dedupe
  // builds can have an already built contextVersion
  mw.req('contextVersion.build.started').require()
    .then(
      mw.req('contextVersion.build.completed').require()
        .then(
          builds.model.modifyCompleted(),
          builds.findById('build._id'),
          mw.res.json(201, 'build'))
        // else fall through to send build and poll mongo
      )
    .else( // build has an unbuilt contextVersion
      flow.try(
        mw.req().set('origContextVersion', 'contextVersion'),
        runnable.create({}, 'sessionUser'),
        runnable.model.buildVersion('contextVersion', { json: 'body' }), // dedupes version
        contextVersions.findById('runnableResult.id().toString()'),
        checkFound('contextVersion'),
        builds.model.replaceContextVersion('origContextVersion', 'contextVersion'),
        builds.findById('params.id')
        // fall through to send build and poll mongo
      ).catch(
        function (err, req, res, next) {
          error.log(err, req);
          var count = createCount(2, next);
          req.contextVersion.updateBuildError(req.err,
            logIfErrAndNext(count.next.bind(count)));
          req.build.modifyErrored(req.contextVersion._id,
            logIfErrAndNext(count.next.bind(count)));
        }
      )
    ),
  resSendBuildAndNext, // respond with build
  mw.req('build.completed').require()
    .else( // if build not yet complete poll mongo until it is
      pollMongo({
        idPath: 'contextVersion._id',
        database: require('models/mongo/context-version'),
        successKeyPath: 'build.completed',
        failureKeyPath: 'build.error',
        failureCb: builds.model.modifyErrored('contextVersion._id')
      }),
      builds.model.modifyCompleted()),
  mw.req('build.successful').validate(validations.equals(true)).then(
    // After the build is completed, redeploy all instances with this build
    instances.findByBuild('build'),
    mw.req('instances').each(
      function (item, req, eachReq, res, next) {
        eachReq.instance = item;
        next();
      },
      runnable.create({}, 'sessionUser'),
      runnable.model.redeployInstance('instance', { json: { build: 'build._id.toString()' } }))),
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

function resSendBuildAndNext (req, res, next) {
  if (!req.hasResponded) {
    res.json(201, req.build);
    req.hasResponded = true;
  }
  next();
}
