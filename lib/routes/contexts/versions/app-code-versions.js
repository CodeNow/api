'use strict';

/**
 * App Code Version API
 * @module rest/contexts/versions/app-code-versions
 */

var express = require('express');
var app = module.exports = express();

var mw = require('dat-middleware');
var flow = require('middleware-flow');
var find = require('101/find');
var hasProps = require('101/has-properties');
var hasKeypaths = require('101/has-keypaths');
var checkFound = require('middlewares/check-found');
var Boom = mw.Boom;
var transformations = require('middlewares/transformations');

var mongoMiddleware = require('middlewares/mongo');
var contexts = mongoMiddleware.contexts;
var contextVersions = mongoMiddleware.contextVersions;
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

var findContextVersion = flow.series(
  contextVersions.findById('params.versionId'),
  checkFound('contextVersion'),
  mw('contextVersion')('build.completed').require()
    .then(mw.next(Boom.badRequest('Cannot modify a built version.'))),
  mw('contextVersion')('build.started').require()
    .then(mw.next(Boom.badRequest('Cannot modify an in progress version.'))));

/** Push a gitRepo to a {@link module:models/version Version}
 *  @param {ObjectId} contextId ID of the {@link module:models/context Context}
 *  @param {ObjectId} id ID of the {@link module:models/version Version}
 *  @param {body.repo}
 *  @param {body.branch} - optional, defaults to master
 *  @param {body.commit} - optional
 *  @returns {object} The Context along with containers that it built
 *  @event POST rest/contexts/:contextId/versions/:id/appCodeVersions
 *  @memberof module:rest/contexts/versions/app-code-versions */
app.post('/:contextId/versions/:id/appCodeVersions',
  findContext,
  contextVersions.findById('params.id'),
  checkFound('contextVersion'),
  mw('contextVersion')('build.completed').require()
    .then(mw.next(Boom.badRequest('Cannot modify a built version.'))),
  mw('contextVersion')('build.started').require()
    .then(mw.next(Boom.badRequest('Cannot modify an in progress version.'))),
  mw.body('branch', 'commit').require()
    .then(mw.next(Boom.badRequest('Provide branch OR commit, not both.'))),
  mw.body({ or: ['branch', 'commit'] }).require()
    .else(mw.body('branch').mapValues(transformations.setDefault('master'))),
  mw.body('repo', 'branch', 'commit').pick(),
  mw.body('repo').require(),
  contextVersions.addGithubRepoToVersion('sessionUser', 'contextVersion._id', 'body'),
  contextVersions.findById('params.id'),
  function (req, res) {
    res.json(201, find(req.contextVersion.appCodeVersions, hasProps({
      lowerRepo: req.body.repo.toLowerCase()
    })));
  });

/** Update an appCodeVersion (gitRepo) for a {@link module:models/version Version}
 *  @param {ObjectId} contextId ID of the {@link module:models/context Context}
 *  @param {ObjectId} versionId ID of the {@link module:models/version Version}
 *  @param {ObjectId} id ID of the appCodeVersion
 *  @param {body.repo} [branch] update the branch of an existing repo
 *  @param {body.commit} [commit] update the commit of an existing repo
 *  @event POST rest/contexts/:contextId/versions/:id/appCodeVersions
 *  @memberof module:rest/contexts/versions/app-code-versions */
app.patch('/:contextId/versions/:versionId/appCodeVersions/:appCodeVersionId',
  findContext,
  findContextVersion,
  mw.params('contextId', 'versionId', 'appCodeVersionId').validate(isObjectId),
  mw.body({ or: ['branch', 'commit'] }).require().string().pick(),
  mw.body('branch', 'commit').require()
    .then(mw.next(Boom.badRequest('Provide branch OR commit, not both.'))),
  contextVersions.model.updateAppCodeVersion('params.appCodeVersionId', 'body'),
  function (req, res) {
    res.json(200, find(req.contextVersion.appCodeVersions, hasKeypaths({
      '_id.toString()': req.params.appCodeVersionId.toString()
    })));
  });

/** Delete an appCodeVersion (gitRepo) for a {@link module:models/version Version}
 *  @param {ObjectId} contextId ID of the {@link module:models/context Context}
 *  @param {ObjectId} versionId ID of the {@link module:models/version Version}
 *  @param {ObjectId} id ID of the appCodeVersion
 *  @event POST rest/contexts/:contextId/versions/:id/appCodeVersions
 *  @memberof module:rest/contexts/versions/app-code-versions */
app.delete('/:contextId/versions/:versionId/appCodeVersions/:appCodeVersionId',
  findContext,
  findContextVersion,
  mw.params('contextId', 'versionId', 'appCodeVersionId').validate(isObjectId),
  contextVersions.model.pullAppCodeVersion('params.appCodeVersionId'),
  mw.res.send(204));
