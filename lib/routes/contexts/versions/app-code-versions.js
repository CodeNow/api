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

var mongoMiddleware = require('middlewares/mongo');
var contexts = mongoMiddleware.contexts;
var contextVersions = mongoMiddleware.contextVersions;
var infraCodeVersions = mongoMiddleware.infraCodeVersions;
var me = require('middlewares/me');
var validations = require('middlewares/validations');
var isObjectId = validations.isObjectId;
var optimus = require('optimus/client');
var isString = require('101/is-string');

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
 *  @param {body.branch}
 *  @param {body.commit}
 *  @returns {object} The Context along with containers that it built
 *  @event POST rest/contexts/:contextId/versions/:id/appCodeVersions
 *  @memberof module:rest/contexts/versions/app-code-versions */
app.post('/contexts/:contextId/versions/:versionId/appCodeVersions',
  findContext,
  findContextVersion,
  mw.body('repo').require().string(),
  mw.body('branch').require().string(),
  mw.body('commit').require().string(),
  contextVersions.addGithubRepoToVersion('sessionUser', 'params.versionId', 'body'),
  contextVersions.findById('params.versionId'),
  function (req, res) {
    res.status(201).json(find(req.contextVersion.appCodeVersions, hasProps({
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
app.patch('/contexts/:contextId/versions/:versionId/appCodeVersions/:appCodeVersionId',
  findContext,
  findContextVersion,
  mw.params('contextId', 'versionId', 'appCodeVersionId').validate(isObjectId),
  mw.body('branch').require().then(mw.body('branch').string()),
  mw.body('commit').require().then(mw.body('commit').string()),
  mw.body({ or: [ 'branch', 'commit', 'transformRules' ] }).require().pick(),
  contextVersions.model.modifyAppCodeVersion('params.appCodeVersionId', 'body'),
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
app.delete('/contexts/:contextId/versions/:versionId/appCodeVersions/:appCodeVersionId',
  findContext,
  findContextVersion,
  mw.params('contextId', 'versionId', 'appCodeVersionId').validate(isObjectId),
  contextVersions.model.pullAppCodeVersion('params.appCodeVersionId'),
  mw.res.send(204));

/**
 * Use Optimus to get the results of the transformation rules for an
 * appCodeVersion.
 * @param {ObjectId} contextId ID of the {@link module:models/context Context}
 * @param {ObjectId} versionId ID of the {@link module:models/version Version}
 * @param {ObjectId} id ID of the appCodeVersion
 * @event POST rest/contexts/:contextId/versions/:id/appCodeVersions/:appcodeVersionId/actions/applyTransformRules
 * @memberof module:rest/contexts/versions/app-code-versions
 */
app.post('/contexts/:contextId/versions/:versionId/appCodeVersions/:appCodeVersionId/actions/applyTransformRules',
  findContext,
  findContextVersion,
  infraCodeVersions.findById('contextVersion.infraCodeVersion', { files: 0 }),
  checkFound('infraCodeVersion'),
  function (req, res) {
    var contextVersion = req.contextVersion
    // TODO This may change in the future, assuming only one for now.
    var appCodeVersion = contextVersion.appCodeVersions[0];
    var infraCodeVersion = req.infraCodeVersion;

    var exclude = appCodeVersion.transformRules.exclude;
    var replace = appCodeVersion.transformRules.replace;
    var rename = appCodeVersion.transformRules.rename;
    var rules = [];

    if (exclude.length > 0) {
      rules.push({ action: 'exclude', files: exclude });
    }
    replace.forEach(function (rule) { rules.push(rule); });
    rename.forEach(function (rule) { rules.push(rule); });


    // TODO Remove temporary logging...
    console.log("\n\n[OPTIMUS] --- BEGIN Rules");
    console.log(rules);
    console.log("[OPTIMUS] -- END rules\n\n")

    //console.log(appCodeVersion._id);
    //console.log(appCodeVersion.transformRules);
    //
    // Ask mighty optimus for the results...
    optimus.transform(
      {
        // optimus does not assume that it is coming from github should it?
        repo: 'git@github.com:' + appCodeVersion.repo,
        commitish: appCodeVersion.commit,
        rules: rules,
        deployKey: appCodeVersion.privateKey
      },
      function (err, response) {
        if (err) { return res.status(500).send(err); }
        // TODO Save script to a build file (currently borking)
        // var fullpath = '/translation_rules.sh';
        // infraCodeVersion.upsertFs(fullpath, response.script, function (err) {
        //   if (err) { return res.status(500).send(err); }
        //   res.status(200).send(response.body);
        // });
        //
        return res.status(200).send(response.body);
      }
    );
  });

/**
 * Tests a single transform rule and responds with what it changes.
 * @param {ObjectId} contextId ID of the {@link module:models/context Context}
 * @param {ObjectId} versionId ID of the {@link module:models/version Version}
 * @param {ObjectId} id ID of the appCodeVersion
 * @event POST rest/contexts/:contextId/versions/:id/appCodeVersions/:appcodeVersionId/actions/applyTransformRules
 * @memberof module:rest/contexts/versions/app-code-versions
 */
app.post('/contexts/:contextId/versions/:versionId/appCodeVersions/:appCodeVersionId/actions/testTransformRule',
  findContext,
  findContextVersion,
  checkFound('infraCodeVersion'),
  function (req, res) {
    if (!req.body) {
      return res.status(400).send(new Error('Post body expects a single transform rule.'));
    }

    if (!isString(req.body.action)) {
      return res.status(400).send(new Error('Supplied transformation rule requires an action attribute.'));
    }

    var contextVersion = req.contextVersion
    var appCodeVersion = contextVersion.appCodeVersions[0];

    var exclude = appCodeVersion.transformRules.exclude;
    var replace = appCodeVersion.transformRules.replace;
    var rename = appCodeVersion.transformRules.rename;
    var rules = [];

    if (exclude.length > 0) {
      rules.push({ action: 'exclude', files: exclude });
    }

    var testRule = req.body;
    if (testRule && testRule.action === 'replace') {
      replace.push(testRule);
    }
    else if (testRule && testRule.action === 'rename') {
      rename.push(testRule);
    }

    replace.forEach(function (rule) { rules.push(rule); });
    rename.forEach(function (rule) { rules.push(rule); });

    // We need this to determine the result to return from optimus
    var ruleIndex = rules.indexOf(testRule);

    // Ask mighty optimus for the results...
    optimus.transform(
      {
        repo: 'git@github.com:' + appCodeVersion.repo,
        commitish: appCodeVersion.commit,
        rules: rules,
        deployKey: appCodeVersion.privateKey
      },
      function (err, response) {
        if (err) { return res.status(500).send(err); }
        return res.status(200).send(response.body.results[ruleIndex]);
      }
    );
  });
