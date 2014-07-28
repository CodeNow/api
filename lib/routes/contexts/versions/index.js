'use strict';

/**
 * Context Version API
 * @module rest/contexts/versions
 */

var express = require('express');
var app = module.exports = express();

var mw = require('dat-middleware');
var flow = require('middleware-flow');
var find = require('101/find');
var hasProps = require('101/has-properties');
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
  // FIXME: either add paging or only allow version listing for sourceContexts for now
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
var pushContextAndVersion = {
  $push: {
    contexts: 'contextVersion.context',
    contextVersions: 'contextVersion._id'
  }
};
app.post('/:contextId/versions',
  findContext,
  mw.query('toBuild').require()
    .then(
      mw.query('toBuild').validate(isObjectId),
      builds.findById('query.toBuild'),
      checkFound('build')),
  mw.req('context.isSource').validate(validations.equals(true))
    .then(mw.body().set('environment', 'context._id')) // Edge-case!:: sources dont need an env
    .else(
      mw.body('environment').require(),
      projects.findOneByEnvId('body.environment'),
      checkFound('project', 'Project with environment not found')),
  contextVersions.createFirstVersion({
    context: 'context._id',
    environment: 'body.environment',
    createdBy: {
      github: 'sessionUser.accounts.github.id'
    }
  }),
  mw.query('toBuild').require()
    .then(
      builds.model.update(pushContextAndVersion)
    ),
  mw.res.json(201, 'contextVersion'));


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
  contextVersions.model.getTriggeredByUsername('sessionUser'),
  mw.res.json('contextVersion'));

app.post('/:contextId/versions/:id/actions/discardFileChanges',
  findContext,
  contextVersions.findById('params.id'),
  checkFound('contextVersion'),
  mw('contextVersion')('infraCodeVersion').require(),
  infraCodeVersions.findById('contextVersion.infraCodeVersion'),
  checkFound('infraCodeVersion'),
  mw('infraCodeVersion')('parentInfraCodeVersion').require()
    .then(infraCodeVersions.model.copyFilesFrom('infraCodeVersion.parentInfraCodeVersion'))
    .else(infraCodeVersions.model.removeAllFiles()),
  mw.res.send(204));

/** Build a {@link module:models/version Version}
 *  @param {ObjectId} contextId ID of the {@link module:models/context Context}
 *  @param {ObjectId} id ID of the {@link module:models/version Version}
 *  @returns {object} The Context along with containers that it built
 *  @event POST rest/contexts/:contextId/versions/:id/build
 *  @memberof module:rest/contexts/versions */
// TODO: not in use.
// app.post('/:contextId/versions/:id/build',
//   findContext,
//   contextVersions.findById('params.id'),
//   checkFound('contextVersion'),
//   contextVersions.buildVersion(),
//   mw.res.json(201, 'contextVersion.build'));

/** Push a gitRepo to a {@link module:models/version Version}
 *  @param {ObjectId} contextId ID of the {@link module:models/context Context}
 *  @param {ObjectId} id ID of the {@link module:models/version Version}
 *  @param {body.repo}
 *  @param {body.branch} - optional, defaults to master
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
  contextVersions.model.addGithubRepo('sessionUser', 'body'),
  function (req, res, next) {
    require('models/mongo/context-version').findById(req.contextVersion.id,
      function (err /*, version */) {
        next(err);
      });
  },
  function (req, res) {
    res.json(201, find(req.contextVersion.appCodeVersions, hasProps({
      lowerRepo: req.body.repo.toLowerCase()
    })));
  });

/** Delete an appCodeVersion (gitRepo) to a {@link module:models/version Version}
 *  @param {ObjectId} contextId ID of the {@link module:models/context Context}
 *  @param {ObjectId} versionId ID of the {@link module:models/version Version}
 *  @param {ObjectId} id ID of the appCodeVersion
 *  @memberof module:rest/contexts/versions */
app.delete('/:contextId/versions/:versionId/appCodeVersions/:id',
  findContext,
  contextVersions.findById('params.versionId'),
  checkFound('contextVersion'),
  mw('contextVersion')('build.completed').require()
    .then(mw.next(Boom.badRequest('Cannot modify a built version.'))),
  mw('contextVersion')('build.started').require()
    .then(mw.next(Boom.badRequest('Cannot modify an in progress version.'))),
  contextVersions.model.pullAppCodeVersion('params.id'),
  mw.res.send(204));


app.put('/:contextId/versions/:versionId/infraCodeVersion/actions/copy',
  mw.params('contextId', 'versionId').validate(isObjectId),
  findContext,
  contextVersions.findById('params.versionId'),
  checkFound('contextVersion'),
  mw('contextVersion')('build.completed').require()
    .then(mw.next(Boom.badRequest('Cannot modify a built version.'))),
  mw('contextVersion')('build.started').require()
    .then(mw.next(Boom.badRequest('Cannot modify an in progress version.'))),
  mw.query('sourceInfraCodeVersion').require().validate(isObjectId),
  function (req, res, next) {
    var InfraCodeVersion = require('models/mongo/infra-code-version');
    InfraCodeVersion.findById(req.query.sourceInfraCodeVersion,
      function (err, infraCodeVersion) {
        if (err) {
          next(err);
        }
        else if (!infraCodeVersion) {
          next(Boom.notFound('Source not found (files)'));
        }
        else {
          next();
        }
      });
  },
  infraCodeVersions.findById('contextVersion.infraCodeVersion'),
  checkFound('infraCodeVersion'),
  infraCodeVersions.model.deleteSourceDir(),
  infraCodeVersions.model.copyFilesFrom('query.sourceInfraCodeVersion'),
  infraCodeVersions.updateById('contextVersion.infraCodeVersion', { $set: {
    parentInfraCodeVersion: 'query.sourceInfraCodeVersion'
  }}),
  mw.res.json(200, 'infraCodeVersion._id'));
