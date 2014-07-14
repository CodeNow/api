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

var mongoMiddleware = require('middlewares/mongo');
var contexts = mongoMiddleware.contexts;
var contextVersions = mongoMiddleware.contextVersions;
var me = require('middlewares/me');


var findContext = flow.series(
  contexts.findById('params.contextId'),
  checkFound('context'),
  flow.or(
    me.isOwnerOf('context'),
    mw.headers('x-github-event').matches(/^push$/),
    me.isModerator));

/** List contextVersions of a {@link module:models/context Context}
 *  @param {ObjectId} contextId ID of the {@link module:models/context Context}
 *  @returns {array.object} List of versions 501
 *  @event GET rest/contexts/:contextId/versions
 *  @memberof module:rest/contexts/versions */
app.get('/:contextId/versions',
  findContext,
  mw.query('_id').require().array(),
  contextVersions.findByIds('query._id'),
  mw.res.json('contextVersions'));

/** Create a new version of a {@link module:models/context Context}
 *  @param {ObjectId} contextId ID of the {@link module:models/context Context}
 *  @returns {object} {@link module:models/version Version}
 *  @event POST rest/contexts/:contextId/versions
 *  @memberof module:rest/contexts/versions */
app.post('/:contextId/versions',
  findContext,
  mw.body('versionId').pick().require(),
  contextVersions.findById('body.versionId'),
  checkFound('contextVersion'),
  contextVersions.createCopy({
    github: 'sessionUser.accounts.github.id'
  }, 'contextVersion'),
  contextVersions.model.save(),
  mw.res.json(201, 'contextVersion'));

/** Get info on a version of a {@link module:models/context Context}
 *  @param {ObjectId} contextId ID of the {@link module:models/context Context}
 *  @param {ObjectId} id ID of the {@link module:models/version Version}
 *  @returns {object} Info on the version
 *  @event GET rest/contexts/:contextId/versions/:id
 *  @memberof module:rest/contexts/versions */
app.get('/:contextId/versions/:id',
  findContext,
  contextVersions.findVersion('params.id'),
  mw.res.json('contextVersion'));

/** Build a {@link module:models/version Version}
 *  @param {ObjectId} contextId ID of the {@link module:models/context Context}
 *  @param {ObjectId} id ID of the {@link module:models/version Version}
 *  @returns {object} The Context along with containers that it built
 *  @event POST rest/contexts/:contextId/versions/:id/build
 *  @memberof module:rest/contexts/versions */
app.post('/:contextId/versions/:id/build',
  findContext,
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
  contextVersions.findVersion('params.id'),
  mw.body('repo', 'branch', 'commit').pick(),
  mw.body('repo').require(),
  mw.log('sessionUser11111111111'),
  mw.log('sessionUser11111111111'),
  mw.log('sessionUser11111111111'),
  contextVersions.model.addGithubRepo(
    'sessionUser.accounts.github.accessToken', 'body'),
  mw.log('sessionUser!'),
  function (req, res) {
    res.json(201, last(req.contextVersion.appCodeVersions));
  });

// app.post('/:contextId/versions/:id/appCodeVersions',
//   findContext,
//   contextVersions.buildVersion(),
//   mw.res.json(201, 'contextVersion.build'));