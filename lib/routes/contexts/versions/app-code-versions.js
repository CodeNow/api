'use strict'

/**
 * App Code Version API
 * @module rest/contexts/versions/app-code-versions
 */

var express = require('express')
var app = module.exports = express()

var mw = require('dat-middleware')
var flow = require('middleware-flow')
var find = require('101/find')
var hasProps = require('101/has-properties')
var hasKeypaths = require('101/has-keypaths')
var isString = require('101/is-string')
var keypather = require('keypather')()
var last = require('101/last')
var checkFound = require('middlewares/check-found')
var Boom = mw.Boom

var ContextService = require('models/services/context-service')
var mongoMiddleware = require('middlewares/mongo')
var contextVersions = mongoMiddleware.contextVersions
var InfraCodeVersionService = require('models/services/infracode-version-service')
var validations = require('middlewares/validations')
var isObjectId = validations.isObjectId
var optimus = require('optimus/client')
var ContextVersion = require('models/mongo/context-version')

var findContext = function (req, res, next) {
  ContextService.findContextAndAssert(req.params.contextId, req.sessionUser)
  .tap(function (context) {
    req.context = context
  })
  .asCallback(function (err) {
    next(err)
  })
}

var findContextVersion = flow.series(
  contextVersions.findById('params.versionId'),
  checkFound('contextVersion'),
  mw('contextVersion')('build.completed').require()
    .then(mw.next(Boom.badRequest('Cannot modify a built version.'))),
  mw('contextVersion')('build.started').require()
    .then(mw.next(Boom.badRequest('Cannot modify an in progress version.'))))

var findInfraCodeVersion = function (req, res, next) {
  var id = keypather.get(req, 'contextVersion.infraCodeVersion')
  InfraCodeVersionService.findICV(id, { files: 0 })
  .tap(function (infraCodeVersion) {
    req.infraCodeVersion = infraCodeVersion
  })
  .asCallback(function (err) {
    next(err)
  })
}

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
  mw.body('commit').require().then(mw.body('commit').string()),
  mw.body('useLatest').require().then(mw.body('useLatest').boolean()),
  contextVersions.addGithubRepoToVersion('sessionUser', 'params.versionId', 'body'),
  contextVersions.findById('params.versionId'),
  function (req, res) {
    res.status(201).json(find(req.contextVersion.appCodeVersions, hasProps({
      lowerRepo: req.body.repo.toLowerCase()
    })))
  })

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
  mw.body({ or: [ 'branch', 'commit', 'transformRules', 'useLatest' ] }).require().pick(),
  contextVersions.model.modifyAppCodeVersion('params.appCodeVersionId', 'body'),
  function (req, res) {
    res.json(200, find(req.contextVersion.appCodeVersions, hasKeypaths({
      '_id.toString()': req.params.appCodeVersionId.toString()
    })))
  })

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
  mw.res.send(204))

/* jshint maxlen: false */

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
  findInfraCodeVersion,
  function applyTransformRules (req, res, next) {
    var contextVersion = req.contextVersion
    // TODO This may change in the future, assuming only one for now.
    var appCodeVersion = ContextVersion
      .getMainAppCodeVersion(contextVersion.appCodeVersions)
    var infraCodeVersion = req.infraCodeVersion

    // Construct the fs-transform rule set
    var exclude = appCodeVersion.transformRules.exclude
    var replace = appCodeVersion.transformRules.replace
    var rename = appCodeVersion.transformRules.rename
    var rules = []
    if (exclude.length > 0) {
      rules.push({ action: 'exclude', files: exclude })
    }
    rules = rules.concat(replace, rename)

    // Ask mighty optimus for the results...
    optimus.transform(
      {
        // optimus does not assume that it is coming from github should it?
        repo: 'git@github.com:' + appCodeVersion.repo,
        commitish: appCodeVersion.commit,
        rules: rules,
        deployKey: appCodeVersion.privateKey
      },
      handleOptimusError(next, function (response) {
        var fullpath = '/translation_rules.sh'
        infraCodeVersion.upsertFs(fullpath, response.body.script, function (err) {
          if (err) {
            return next(Boom.create(504, err.message, err))
          }
          res.json(response.body)
        })
      })
    )
  })

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
  /* jshint maxcomplexity:7 */
  function testTransformRule (req, res, next) {
    // Validate that the given rule conforms to our expectations
    var testRule = req.body

    if (!isString(testRule.action)) {
      return next(Boom.badRequest(
        'Supplied transformation rule requires an action attribute.'
      ))
    }

    if (testRule.action !== 'rename' && testRule.action !== 'replace') {
      return next(Boom.badRequest(
        'Invalid action "' + testRule.action + '" given' +
        ' for test rule. Expected "rename" or "replace".'
      ))
    }

    // Get required information to build a partial rule set
    var contextVersion = req.contextVersion.toJSON()
    var appCodeVersion = ContextVersion
      .getMainAppCodeVersion(contextVersion.appCodeVersions)

    var transformRules = appCodeVersion.transformRules
    var exclude = transformRules.exclude
    var replace = transformRules.replace
    var rename = transformRules.rename
    var rules = []

    if (exclude.length > 0) {
      rules.push({ action: 'exclude', files: exclude })
    }

    // Build the partial rule set.
    // Note: since replace and rename rules are pretty much independent we will
    // only be testing the rules from the set that the test rule belongs.
    var ruleCollection = (testRule.action === 'replace') ? replace : rename

    // If the supplied rule was given with a mongo id, cut off the rule set at
    // that point.
    if (testRule._id) {
      var oldRule = ruleCollection.filter(function (rule) {
        return rule._id.toString() === testRule._id.toString()
      }).pop()
      if (!oldRule) {
        return next(Boom.badRequest(
          'Rule with given _id: "' + testRule._id + '" was not found.'
        ))
      }
      ruleCollection = ruleCollection.slice(0, ruleCollection.indexOf(oldRule))
    }

    // Add the rule to the end of the collection and push the rules into the
    // final rule list
    rules = rules.concat(ruleCollection, testRule)

    // Ask optimus for the results...
    optimus.transform(
      {
        repo: 'git@github.com:' + appCodeVersion.repo,
        commitish: appCodeVersion.commit,
        rules: rules,
        deployKey: appCodeVersion.privateKey
      },
      handleOptimusError(next, function (response) {
        res.json(last(response.body.results))
      })
    )
  })

/**
 * Handles error responses from optimus.
 * @param {function} next Next method for the containing route, this is used
 *   to bypass the route and pass errors to default handlers.
 * @param {function} cb Callback to execute if an error _DID NOT_ occur.
 * @return {function} A function that wraps the callback and handles errors
 *  from optimus.
 */
function handleOptimusError (next, cb) {
  return function (err, response) {
    // Errors from simple-api-client (via request) are most likely timeouts
    if (err) {
      return next(Boom.create(504, err.message, {
        err: err,
        report: false
      }))
    }
    // 500 and greater should come back as a 502 Gateway Error
    if (response.statusCode >= 500) {
      return next(Boom.create(502, response.body.message, {
        report: false
      }))
    }
    // 400 and greater should be passed directly
    if (response.statusCode >= 400) {
      return next(Boom.create(response.statusCode, response.body.message, {
        report: false
      }))
    }
    var args = Array.prototype.slice.call(arguments, 1) // do not include err
    cb.apply(cb, args)
  }
}
