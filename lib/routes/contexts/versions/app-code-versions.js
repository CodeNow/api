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
 * Use Optimus to get the results of the transformation rules.
 *
 * This route performs two major tasks. The first is to execute saved transform
 * rules, report output from optimus, and save the resulting script to the
 * build files.
 *
 * The second task is to test the results of rules that are in the process of
 * being created. In this case the user will provide a rule in the POST body
 * to the request that will get tacked on to the optimus request. When using
 * the route this way the script will not be saved.
 *
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

    // Add global file excludes to the ruleset (if applicable)
    if (exclude.length > 0) {
      rules.push({ action: 'exclude', files: exclude });
    }

    // Handle optional test rules
    var testRule = (req.body && req.body.action) ? req.body : null;
    if (testRule && testRule.action === 'replace') {
      replace.push(testRule);
    }
    else if (testRule && testRule.action === 'rename') {
      rename.push(testRule);
    }

    // Add search/replace and then rename rules to the ruleset
    replace.forEach(function (rule) { rules.push(rule); });
    rename.forEach(function (rule) { rules.push(rule); });

    // TODO Remove temporary logging...
    console.log("\n\n[OPTIMUS] --- BEGIN Rules");
    console.log(rules);
    console.log("[OPTIMUS] -- END rules\n\n")

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

        return res.status(200).send(response.body);

        // If we're testing a rule, skip the file save
        //if (testRule) { return res.status(200).send(response.body); }

        // Saves the translation rules script into the build files
        //
        // TODO This is not working, fix me!!!
        //
        // var fullpath = '/translation_rules.sh';
        // infraCodeVersion.upsertFs(fullpath, response.script, function (err) {
        //   if (err) { return res.status(500).send(err); }
        //   res.status(200).send(response.body);
        // });
      }
    );
  });
