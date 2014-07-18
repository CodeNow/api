'use strict';

/**
 * Context Version API
 * @module rest/contexts/versions
 */

var express = require('express');
var app = module.exports = express();

var mw = require('dat-middleware');
var flow = require('middleware-flow');
var last = require('101/last');
var checkFound = require('middlewares/check-found');
var Boom = mw.Boom;

var mongoMiddleware = require('middlewares/mongo');
var contexts = mongoMiddleware.contexts;
var contextVersions = mongoMiddleware.contextVersions;
var projects = mongoMiddleware.projects;
var infraCodeVersions = mongoMiddleware.infraCodeVersions;
var builds = mongoMiddleware.builds;
var me = require('middlewares/me');
var validations = require('middlewares/validations');
var isObjectId = validations.isObjectId;

var findContext = flow.series(
  contexts.findById('params.contextId'),
  checkFound('context'),
  flow.or(
    me.isOwnerOf('context'),
    mw.req('context.isSource').validate(validations.equals(true)),
    mw.headers('x-github-event').matches(/^push$/),
    me.isModerator));

/** List contextVersions of a {@link module:models/context Context}
 *  @param {ObjectId} contextId ID of the {@link module:models/context Context}
 *  @returns {array.object} List of versions 501
 *  @event GET rest/contexts/:contextId/versions
 *  @memberof module:rest/contexts/versions */
app.get('/:contextId/versions',
  findContext,
  contextVersions.find({
    context: 'context._id'
  }),
  checkFound('contextVersions'),
  mw.res.json('contextVersions'));

/** Create a new version of a {@link module:models/context Context}
 *  @param {ObjectId} contextId ID of the {@link module:models/context Context}
 *  @returns {object} {@link module:models/version Version}
 *  @event POST rest/contexts/:contextId/versions
 *  @memberof module:rest/contexts/versions */
var createFromSource = flow.series(
  mw.query('fromSource').validate(isObjectId),
  infraCodeVersions.findById('query.fromSource'),
  checkFound('infraCodeVersion'),
  mw.req().unset('infraCodeVersion'),
  // toBuild is required, and must be an ObjectID as well, and valid
  mw.query('toBuild').require().validate(isObjectId),
  builds.findById('query.toBuild'),
  checkFound('build'),
  // create the new ICV (for this context)
  infraCodeVersions.create({ context: 'context._id' }),
  // deep copy the fromSource ICV
  infraCodeVersions.model.copyFilesFromVersion('query.fromSource'),
  // make a new contextVersion with the new ICV
  contextVersions.create({
    createdBy: { github: 'sessionUser.accounts.github.id' },
    context: 'context._id',
    environment: 'body.environment',
    infraCodeVersion: 'infraCodeVersion._id'
  }),
  contextVersions.model.save(),
  builds.model.update({ $push: {
    contextVersions: 'contextVersion._id'
  }})
);
var createFirstForEnv =
  contextVersions.createFirstVersionForEnv({
    context: 'context._id',
    environment: 'body.environment',
    createdBy: {
      github: 'sessionUser.accounts.github.id'
    }
  });
app.post('/:contextId/versions',
  findContext,
  mw.req('context.isSource').validate(validations.equals(true))
    .then(mw.body().set('environment', 'context._id')) // Edge-case!:: sources dont need an env
    .else(
      mw.body('environment').require(),
      projects.findOneByEnvId('body.environment'),
      checkFound('project', 'Project with environment not found')),
  mw.query('fromSource').require()
    .then(createFromSource)
    .else(createFirstForEnv),
  mw.res.json(201, 'contextVersion')
);


  // mw.body('versionId').pick().require(),
  // contextVersions.findById('body.versionId'),
  // checkFound('contextVersion'),
  // contextVersions.createDeepCopy('contextVersion', {
  //   github: 'sessionUser.accounts.github.id'
  // }),
  // contextVersions.model.save(),
  // mw.res.json(201, 'contextVersion'));

/** Get info on a version of a {@link module:models/context Context}
 *  @param {ObjectId} contextId ID of the {@link module:models/context Context}
 *  @param {ObjectId} id ID of the {@link module:models/version Version}
 *  @returns {object} Info on the version
 *  @event GET rest/contexts/:contextId/versions/:id
 *  @memberof module:rest/contexts/versions */
app.get('/:contextId/versions/:id',
  findContext,
  contextVersions.findById('params.id'),
  checkFound('contextVersion'),
  mw.res.json('contextVersion'));

/** Build a {@link module:models/version Version}
 *  @param {ObjectId} contextId ID of the {@link module:models/context Context}
 *  @param {ObjectId} id ID of the {@link module:models/version Version}
 *  @returns {object} The Context along with containers that it built
 *  @event POST rest/contexts/:contextId/versions/:id/build
 *  @memberof module:rest/contexts/versions */
app.post('/:contextId/versions/:id/build',
  findContext,
  contextVersions.findById('params.id'),
  checkFound('contextVersion'),
  contextVersions.buildVersion(),
  mw.res.json(201, 'contextVersion.build'));

/** Push a gitRepo to a {@link module:models/version Version}
 *  @param {ObjectId} contextId ID of the {@link module:models/context Context}
 *  @param {ObjectId} id ID of the {@link module:models/version Version}
 *  @param {body.repo}
 *  @param {body.branch} - optional
 *  @param {body.commit} - optional
 *  @returns {object} The Context along with containers that it built
 *  @event POST rest/contexts/:contextId/versions/:id/build
 *  @memberof module:rest/contexts/versions */
app.post('/:contextId/versions/:id/appCodeVersions',
  findContext,
  contextVersions.findById('params.id'),
  checkFound('contextVersion'),
  mw('contextVersion')('build.completed').require()
    .then(mw.next(Boom.badRequest('Cannot modify a built version.'))),
  mw('contextVersion')('build.started').require()
    .then(mw.next(Boom.badRequest('Cannot modify an in progress version.'))),
  mw.body('repo', 'branch', 'commit').pick(),
  mw.body('repo').require(),
  contextVersions.model.addGithubRepo(
    'sessionUser.accounts.github.accessToken', 'body'),
  function (req, res, next) {
    require('models/mongo/context-version').findById(req.contextVersion.id,
      function (err, version) {
        next(err);
      });
  },
  function (req, res) {
    res.json(201, last(req.contextVersion.appCodeVersions));
  });

/** Delete an appCodeVersion (gitRepo) to a {@link module:models/version Version}
 *  @param {ObjectId} contextId ID of the {@link module:models/context Context}
 *  @param {ObjectId} versionId ID of the {@link module:models/version Version}
 *  @param {ObjectId} id ID of the appCodeVersion
 *  @memberof module:rest/contexts/versions */
app.delete('/:contextId/versions/:versionId/appCodeVersions/:id',
  findContext,
  contextVersions.findById('params.id'),
  checkFound('contextVersion'),
  mw('contextVersions')('build').require()
    .then(mw.next(Boom.badRequest('Cannot modify a built (or in progress) version.'))),
  contextVersions.model.pullAppCodeVersion('params.id'),
  mw.res.json(204));
