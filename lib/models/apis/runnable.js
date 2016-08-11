/**
 * For API requests initiated within API routes
 * @module lib/models/apis/runnable
 */
'use strict'

var async = require('async')
var Base = require('@runnable/api-client/lib/models/base')
var pick = require('101/pick')
var RunnableUser = require('@runnable/api-client')
var util = require('util')

var logger = require('middlewares/logger')(__filename)
var log = logger.log

Base.prototype.parse = function (attrs) {
  if (attrs.toJSON) {
    attrs = attrs.toJSON()
  }
  attrs = JSON.parse(JSON.stringify(attrs))
  return attrs
}

module.exports = Runnable

function Runnable (headers) {
  this.headers = headers
  var host = process.env.FULL_API_DOMAIN
  var opts = {}
  if (headers) {
    opts = {
      requestDefaults: {
        headers: pick(headers, ['cookie'])
      }
    }
  }
  RunnableUser.call(this, host, opts)
}

/**
 * Internal method. Better for unit testing, it is.
 * @private
 * @see {Runnable}
 * @returns {Runnable}
 */
Runnable.createClient = function (headers) {
  return new Runnable(headers)
}

util.inherits(Runnable, RunnableUser)

Runnable.prototype.buildBuild = function (build, opts, cb) {
  log.info({
    tx: true
  }, 'Runnable.prototype.buildBuild')
  if (build.toJSON) {
    build = build.toJSON()
  }
  var buildModel = this
    .newBuild(build._id.toString())
  buildModel.build(opts, cb)
}

/**
 * Create new build and build it. Two API calls
 * @param  {String}   cvId          context version id
 * @param  {Number}   ownerGithubId github id for the new build owner
 * @param  {String}   triggeredActionName name of the triggered action: autodeploy or autolaunch
 * @param  {Object}   codeVersion   codeVersion should include repo, commit, branch, commitLog
 * @param  {Function} cb            standard callback with 2 params. Return newBuild on success
 */
Runnable.prototype.createAndBuildBuild = function (cvId, ownerGithubId, triggeredActionName, codeVersion, cb) {
  log.info({
    ownerGithubId: ownerGithubId,
    codeVersion: codeVersion
  }, 'Runnable.prototype.createAndBuildBuild')
  var newBuildPayload = {
    contextVersions: [cvId],
    owner: {
      github: ownerGithubId
    }
  }
  var buildBuildPayload = {
    message: triggeredActionName,
    triggeredAction: {
      manual: false,
      appCodeVersion: codeVersion
    }
  }
  this.createBuild({ json: newBuildPayload }, function (err, newBuild) {
    if (err) { return cb(err) }
    this.buildBuild(newBuild, { json: buildBuildPayload }, cb)
  }.bind(this))
}

Runnable.prototype.createContextVersion = function (contextId, cb) {
  log.info({
    contextId: contextId
  }, 'Runnable.prototype.createContextVersion')
  this
    .newContext(contextId.toString())
    .createVersion(cb)
}

Runnable.prototype.copyVersionIcvFiles = function (contextId, cvId, icvId, cb) {
  log.info({
    contextId: contextId,
    cvId: cvId,
    icvId: icvId
  }, 'Runnale.prototype.copyVersionIcvFiles')
  this
    .newContext(contextId.toString())
    .newVersion(cvId.toString())
    .copyFilesFromSource(icvId.toString(), cb)
}

Runnable.prototype.deepCopyContextVersion = function (contextId, contextVersionId, cb) {
  log.info({
    contextId: contextId,
    contextVersionId: contextVersionId
  }, 'Runnable.prototype.deepCopyContextVersion')
  var newCV = this
    .newContext(contextId.toString())
    .newVersion({
      _id: contextVersionId.toString(),
      context: contextId.toString()
    })
    .deepCopy(function (err) {
      cb(err, newCV)
    })
}

Runnable.prototype.deepCopyContextVersions = function (contextIds, contextVersionIds, cb) {
  log.info({
    contextIds: contextIds,
    contextVersionIds: contextVersionIds
  }, 'Runnable.prototype.deepCopyContextVersions')
  var self = this
  var idsArr = contextVersionIds.map(function (versionId, i) {
    return {
      contextId: contextIds[i].toString(),
      versionId: versionId.toString()
    }
  })
  async.map(idsArr, function (ids, cb) {
    var newSelf = new Runnable(self.headers)
    newSelf.deepCopyContextVersion(ids.contextId, ids.versionId, cb)
  }, cb)
}
